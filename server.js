/**
 * CAPFIT — Proxy Server (solo para desarrollo local)
 * Lee las API keys del archivo .env
 *
 * Uso:
 *   npm install dotenv   (solo la primera vez)
 *   node server.js
 *   Abrí http://localhost:3000
 */

require('dotenv').config();

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = 3000;

// Verificar que las keys estén configuradas
if (!process.env.FAL_KEY) {
  console.warn('⚠️  FAL_KEY no encontrada en .env — el try-on no va a funcionar');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ico':  'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function proxyRequest(targetHost, targetPath, method, headers, body, res) {
  const proxyReq = https.request({ hostname: targetHost, path: targetPath, method, headers }, proxyRes => {
    const outHeaders = { ...corsHeaders() };
    if (proxyRes.headers['content-type']) outHeaders['Content-Type'] = proxyRes.headers['content-type'];
    res.writeHead(proxyRes.statusCode, outHeaders);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', err => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, corsHeaders());
      res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    }
  });
  if (body && body.length > 0) proxyReq.write(body);
  proxyReq.end();
}


// Subir data URI al storage de fal.ai y obtener URL pública
function httpsReq(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.request({ hostname, path, method, headers }, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), json(){ return JSON.parse(this.body.toString()); } }));
    });
    req.on('error', reject);
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

async function uploadDataURItoFal(dataURI, falKey) {
  const match = dataURI.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Formato imagen inválido');
  const mimeType = match[1];
  const buffer   = Buffer.from(match[2], 'base64');
  const initBody = Buffer.from(JSON.stringify({ content_type: mimeType, file_size: buffer.length }));
  const init = await httpsReq('rest.alpha.fal.ai', '/storage/upload/initiate', 'POST', {
    'Authorization': 'Key ' + falKey,
    'Content-Type':  'application/json',
    'Content-Length': initBody.length,
  }, initBody);
  if (init.status !== 200) {
    // fallback directo
    const up = await httpsReq('storage.fal.ai', '/upload', 'POST', {
      'Authorization': 'Key ' + falKey, 'Content-Type': mimeType, 'Content-Length': buffer.length,
    }, buffer);
    const d = up.json();
    if (!d.url) throw new Error('Upload falló: ' + up.body.toString());
    return d.url;
  }
  const { upload_url, file_url } = init.json();
  const u = new URL(upload_url);
  await httpsReq(u.hostname, u.pathname + u.search, 'PUT', {
    'Content-Type': mimeType, 'Content-Length': buffer.length,
  }, buffer);
  return file_url;
}

const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const reqPath = parsed.pathname;
  const qs      = parsed.query;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders()); res.end(); return;
  }

  // ── /api/anthropic ──────────────────────────────────────
  if (reqPath === '/api/anthropic') {
    const apiKey = process.env.ANTHROPIC_KEY || '';
    if (!apiKey) {
      res.writeHead(500, corsHeaders());
      res.end(JSON.stringify({ error: 'ANTHROPIC_KEY no configurada en .env' }));
      return;
    }
    console.log('[anthropic] POST');
    try {
      const body = await readBody(req);
      proxyRequest('api.anthropic.com', '/v1/messages', 'POST', {
        'Content-Type':      'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key':         apiKey,
        'Content-Length':    Buffer.byteLength(body),
      }, body, res);
    } catch(e) { res.writeHead(500, corsHeaders()); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

   // ── /api/gpt/edit → fal.run/openai/gpt-image-2/edit ────
  if (reqPath === '/api/gpt/edit') {
    const falKey = process.env.FAL_KEY || '';
    
    // ===== LOGS DE DEBUG =====
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  [DEBUG] /api/gpt/edit llamado             ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log('║  FAL_KEY presente:  ', falKey ? '✓ SÍ' : '✗ NO');
    if (falKey) console.log('║  FAL_KEY preview:   ', falKey.slice(0, 12) + '...');
    console.log('╚════════════════════════════════════════════╝');
    // =========================

    if (!falKey) {
      console.error('[DEBUG] ERROR: FAL_KEY no configurada en .env');
      res.writeHead(500, corsHeaders());
      res.end(JSON.stringify({ error: 'FAL_KEY no configurada en .env' }));
      return;
    }
    
    console.log('[DEBUG] Leyendo body del request...');
    
    try {
      const body = await readBody(req);
      console.log('[DEBUG] Body recibido: ' + body.length + ' bytes');
      console.log('[DEBUG] Primeros 200 chars del body:', body.toString().slice(0, 200));

      console.log('[DEBUG] Enviando request a fal.run/openai/gpt-image-2/edit...');
      console.log('[DEBUG] Headers:', {
        'Content-Type': 'application/json',
        'Authorization': 'Key ' + falKey.slice(0, 8) + '...',
        'Content-Length': body.length
      });

      proxyRequest('fal.run', '/openai/gpt-image-2/edit', 'POST', {
        'Content-Type':   'application/json',
        'Authorization':  'Key ' + falKey,
        'Content-Length': body.length,
      }, body, res);

      console.log('[DEBUG] Request proxy enviada. Esperando respuesta de fal.ai...');

    } catch(e) { 
      console.error('[DEBUG] ERROR en /api/gpt/edit:', e.message);
      console.error('[DEBUG] Stack:', e.stack);
      res.writeHead(500, corsHeaders()); 
      res.end(JSON.stringify({ error: e.message })); 
    }
    return;
  }

  // ── /api/fal/submit ─────────────────────────────────────
    // ── /api/fal/submit ─────────────────────────────────────
  if (reqPath === '/api/fal/submit') {
    const falKey = process.env.FAL_KEY || '';
    const model = qs.model || 'fal-ai/fashn/tryon/v1.5';

    // ===== LOGS DE DEBUG =====
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  [DEBUG] /api/fal/submit llamado           ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log('║  FAL_KEY presente:  ', falKey ? '✓ SÍ' : '✗ NO');
    console.log('║  Model:             ', model);
    console.log('╚════════════════════════════════════════════╝');
    // =========================

    if (!falKey) {
      console.error('[DEBUG] ERROR: FAL_KEY no configurada');
      res.writeHead(500, corsHeaders());
      res.end(JSON.stringify({ error: 'FAL_KEY no configurada en .env' }));
      return;
    }
    
    console.log('[DEBUG] Leyendo body...');
    
    try {
      const rawBody = await readBody(req);
      console.log('[DEBUG] Body raw recibido: ' + rawBody.length + ' bytes');
      
      const payload = JSON.parse(rawBody.toString());
      console.log('[DEBUG] Payload parseado. Keys:', Object.keys(payload));
      console.log('[DEBUG] model_image presente:', payload.model_image ? '✓' : '✗');
      console.log('[DEBUG] garment_image presente:', payload.garment_image ? '✓' : '✗');

      // Subir imágenes para obtener URLs públicas
      console.log('[DEBUG] Subiendo imágenes a fal.ai storage...');
      const [personURL, garmentURL] = await Promise.all([
        uploadDataURItoFal(payload.model_image, falKey),
        uploadDataURItoFal(payload.garment_image, falKey),
      ]);
      console.log('[DEBUG] Upload OK. personURL:', personURL.slice(0, 50) + '...');
      console.log('[DEBUG] Upload OK. garmentURL:', garmentURL.slice(0, 50) + '...');

      payload.model_image   = personURL;
      payload.garment_image = garmentURL;

      const newBody = Buffer.from(JSON.stringify(payload));
      console.log('[DEBUG] Enviando a queue.fal.run/' + model);

      proxyRequest('queue.fal.run', '/' + model, 'POST', {
        'Content-Type':   'application/json',
        'Content-Length': newBody.length,
        'Authorization':  'Key ' + falKey,
      }, newBody, res);

      console.log('[DEBUG] Request proxy enviado a queue.fal.run');

    } catch(e) { 
      console.error('[DEBUG] ERROR en /api/fal/submit:', e.message);
      console.error('[DEBUG] Stack:', e.stack);
      res.writeHead(500, corsHeaders()); 
      res.end(JSON.stringify({ error: e.message })); 
    }
    return;
  }

  // ── /api/fal/status ─────────────────────────────────────
  if (reqPath === '/api/fal/status') {
    const falKey = process.env.FAL_KEY || '';
    const model  = qs.model  || 'fal-ai/fashn/tryon/v1.5';
    const reqId  = qs.reqId  || '';
    console.log('[fal] status →', reqId);
    try {
      proxyRequest('queue.fal.run', '/' + model + '/requests/' + reqId + '/status', 'GET', {
        'Authorization': 'Key ' + falKey,
      }, null, res);
    } catch(e) { res.writeHead(500, corsHeaders()); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // ── /api/fal/result ─────────────────────────────────────
  if (reqPath === '/api/fal/result') {
    const falKey = process.env.FAL_KEY || '';
    const model  = qs.model || 'fal-ai/fashn/tryon/v1.5';
    const reqId  = qs.reqId || '';
    console.log('[fal] result →', reqId);
    try {
      proxyRequest('queue.fal.run', '/' + model + '/requests/' + reqId, 'GET', {
        'Authorization': 'Key ' + falKey,
      }, null, res);
    } catch(e) { res.writeHead(500, corsHeaders()); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // ── Archivos estáticos ───────────────────────────────────
  let filePath = path.join(__dirname, reqPath === '/' ? 'index.html' : reqPath);
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404: ' + reqPath); return; }
    const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║         CAPFIT — Dev Server           ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log(`║  Sitio:  http://localhost:${PORT}         ║`);
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  console.log('  Keys cargadas:');
  console.log('  FAL_KEY:       ', process.env.FAL_KEY       ? '✓' : '✗ falta en .env');
  console.log('  ANTHROPIC_KEY: ', process.env.ANTHROPIC_KEY ? '✓' : '✗ falta en .env (opcional)');
  console.log('');
});