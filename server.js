require('dotenv').config();

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = 3000;

// Verificar variables de entorno
const HF_TOKEN = process.env.HF_TOKEN || '';
const FAL_KEY = process.env.FAL_KEY || '';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';

if (!HF_TOKEN) {
  console.warn('⚠️  HF_TOKEN no encontrada en .env — HF Inference API tendrá rate limits bajos (1 req/hora)');
}
if (!FAL_KEY) {
  console.warn('⚠️  FAL_KEY no encontrada en .env');
}
if (!REPLICATE_API_TOKEN) {
  console.warn('⚠️  REPLICATE_API_TOKEN no encontrada en .env');
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

// Helper: Llamar a Hugging Face Inference API
function callHFInference(model, payload, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const chunks = [];
    const req = https.request({
      hostname: 'api-inference.huggingface.co',
      path: '/models/' + model,
      method: 'POST',
      headers,
    }, resp => {
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          status: resp.statusCode,
          headers: resp.headers,
          buffer: buffer,
          isImage: resp.headers['content-type'] && resp.headers['content-type'].includes('image'),
        });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const reqPath = parsed.pathname;
  const qs      = parsed.query;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders()); res.end(); return;
  }

  // ── ANTHROPIC PROXY ──
  if (reqPath === '/api/anthropic') {
    const apiKey = process.env.ANTHROPIC_KEY || '';
    if (!apiKey) {
      res.writeHead(500, corsHeaders());
      res.end(JSON.stringify({ error: 'ANTHROPIC_KEY no configurada' }));
      return;
    }
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

  // ── FAL.AI PROXY ──
  if (reqPath === '/api/fal/submit') {
    if (!FAL_KEY) {
      res.writeHead(500, corsHeaders());
      res.end(JSON.stringify({ error: 'FAL_KEY no configurada' }));
      return;
    }
    const model = qs.model || 'fal-ai/fashn/tryon/v1.5';
    try {
      const body = await readBody(req);
      proxyRequest('queue.fal.run', '/' + model, 'POST', {
        'Content-Type':   'application/json',
        'Content-Length': body.length,
        'Authorization':  'Key ' + FAL_KEY,
      }, body, res);
    } catch(e) { res.writeHead(500, corsHeaders()); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  if (reqPath === '/api/fal/status') {
    const model  = qs.model  || 'fal-ai/fashn/tryon/v1.5';
    const reqId  = qs.reqId  || '';
    try {
      proxyRequest('queue.fal.run', '/' + model + '/requests/' + reqId + '/status', 'GET', {
        'Authorization': 'Key ' + FAL_KEY,
      }, null, res);
    } catch(e) { res.writeHead(500, corsHeaders()); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  if (reqPath === '/api/fal/result') {
    const model  = qs.model || 'fal-ai/fashn/tryon/v1.5';
    const reqId  = qs.reqId || '';
    try {
      proxyRequest('queue.fal.run', '/' + model + '/requests/' + reqId, 'GET', {
        'Authorization': 'Key ' + FAL_KEY,
      }, null, res);
    } catch(e) { res.writeHead(500, corsHeaders()); res.end(JSON.stringify({ error: e.message })); }
    return;
  }

  // ── REPLICATE PROXY ──
  if (reqPath === '/api/replicate/tryon') {
    if (!REPLICATE_API_TOKEN) {
      res.writeHead(500, corsHeaders());
      res.end(JSON.stringify({ error: 'REPLICATE_API_TOKEN no configurada' }));
      return;
    }

    try {
      const body = await readBody(req);
      const payload = JSON.parse(body.toString());
      const { person_image, garment_image, garment_des, category } = payload;

      // Obtener latest version
      const versionResp = await new Promise((resolve, reject) => {
        const chunks = [];
        const r = https.request({
          hostname: 'api.replicate.com',
          path: '/v1/models/cuuupid/idm-vton',
          method: 'GET',
          headers: {
            'Authorization': 'Token ' + REPLICATE_API_TOKEN,
            'Content-Type': 'application/json',
          }
        }, resp => {
          resp.on('data', c => chunks.push(c));
          resp.on('end', () => resolve({
            status: resp.statusCode,
            body: Buffer.concat(chunks).toString()
          }));
        });
        r.on('error', reject);
        r.end();
      });

      let version = '73d0a6f1c0e9f6c5c0b0e0d0c0b0a0f0e0d0c0b0a090807060504030201000';
      if (versionResp.status === 200) {
        try {
          const vd = JSON.parse(versionResp.body);
          if (vd.latest_version && vd.latest_version.id) version = vd.latest_version.id;
        } catch (e) {}
      }

      const replicateBody = JSON.stringify({
        version: version,
        input: {
          human_img: person_image,
          garm_img: garment_image,
          garment_des: garment_des || 'cap',
          category: category || 'upper_body',
          crop: false,
          seed: 42,
          steps: 30,
        }
      });

      const createResp = await new Promise((resolve, reject) => {
        const chunks = [];
        const r = https.request({
          hostname: 'api.replicate.com',
          path: '/v1/predictions',
          method: 'POST',
          headers: {
            'Authorization': 'Token ' + REPLICATE_API_TOKEN,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(replicateBody),
          }
        }, resp => {
          resp.on('data', c => chunks.push(c));
          resp.on('end', () => resolve({
            status: resp.statusCode,
            body: Buffer.concat(chunks).toString()
          }));
        });
        r.on('error', reject);
        r.write(replicateBody);
        r.end();
      });

      if (createResp.status !== 201) {
        res.writeHead(createResp.status, corsHeaders());
        res.end(JSON.stringify({ error: 'Error creando predicción', detail: createResp.body }));
        return;
      }

      const prediction = JSON.parse(createResp.body);

      if (prediction.status === 'succeeded' && prediction.output) {
        res.writeHead(200, corsHeaders());
        res.end(JSON.stringify({ image: prediction.output, source: 'replicate' }));
        return;
      }

      // Poll
      const maxWait = 180000;
      const pollInterval = 3000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));

        const pollResp = await new Promise((resolve, reject) => {
          const chunks = [];
          const r = https.request({
            hostname: 'api.replicate.com',
            path: '/v1/predictions/' + prediction.id,
            method: 'GET',
            headers: {
              'Authorization': 'Token ' + REPLICATE_API_TOKEN,
              'Content-Type': 'application/json',
            }
          }, resp => {
            resp.on('data', c => chunks.push(c));
            resp.on('end', () => resolve({
              status: resp.statusCode,
              body: Buffer.concat(chunks).toString()
            }));
          });
          r.on('error', reject);
          r.end();
        });

        if (pollResp.status !== 200) continue;
        const pollData = JSON.parse(pollResp.body);

        if (pollData.status === 'succeeded') {
          res.writeHead(200, corsHeaders());
          res.end(JSON.stringify({ image: pollData.output, source: 'replicate' }));
          return;
        }
        if (pollData.status === 'failed' || pollData.status === 'canceled') {
          res.writeHead(500, corsHeaders());
          res.end(JSON.stringify({ error: 'Predicción falló: ' + (pollData.error || '') }));
          return;
        }
      }

      res.writeHead(504, corsHeaders());
      res.end(JSON.stringify({ error: 'Timeout' }));

    } catch(e) { 
      res.writeHead(500, corsHeaders()); 
      res.end(JSON.stringify({ error: e.message })); 
    }
    return;
  }

  // ── HUGGING FACE INFERENCE API (INPAINTING) ──
  if (reqPath === '/api/hf/inpaint') {
    console.log('[HF Inpaint] POST /api/hf/inpaint');

    try {
      const body = await readBody(req);
      const payload = JSON.parse(body.toString());
      const { person_image, garment_image, prompt, mask_data } = payload;

      if (!person_image) {
        res.writeHead(400, corsHeaders());
        res.end(JSON.stringify({ error: 'person_image requerida' }));
        return;
      }

      // Si nos pasan una máscara pre-generada, la usamos
      // Si no, generamos una máscara simple (zona superior de la cabeza)
      let maskImage = mask_data;
      if (!maskImage) {
        // Generar máscara simple: zona superior de la imagen (donde va la gorra)
        // Esto es un placeholder - en producción se debería detectar la cara
        console.log('[HF Inpaint] Generando máscara por defecto (zona superior)...');
        maskImage = await generarMascaraDefault(person_image);
      }

      const model = 'runwayml/stable-diffusion-inpainting';

      const inferencePayload = {
        inputs: prompt || 'person wearing a stylish baseball cap, realistic photo, high quality',
        image: person_image,
        mask_image: maskImage,
      };

      console.log('[HF Inpaint] Llamando a Inference API...');
      const hfResp = await callHFInference(model, inferencePayload, HF_TOKEN);

      console.log('[HF Inpaint] Status:', hfResp.status);
      console.log('[HF Inpaint] Content-Type:', hfResp.headers['content-type']);

      if (hfResp.status === 200 && hfResp.isImage) {
        // La API retornó una imagen directamente
        const base64Image = 'data:image/png;base64,' + hfResp.buffer.toString('base64');
        console.log('[HF Inpaint] ✅ Imagen generada');
        res.writeHead(200, corsHeaders());
        res.end(JSON.stringify({ image: base64Image, source: 'hf-inpaint' }));
        return;
      }

      if (hfResp.status === 503) {
        // Modelo cargando
        console.log('[HF Inpaint] ⏳ Modelo cargando, reintentando...');
        await new Promise(r => setTimeout(r, 20000));

        const retryResp = await callHFInference(model, inferencePayload, HF_TOKEN);
        if (retryResp.status === 200 && retryResp.isImage) {
          const base64Image = 'data:image/png;base64,' + retryResp.buffer.toString('base64');
          res.writeHead(200, corsHeaders());
          res.end(JSON.stringify({ image: base64Image, source: 'hf-inpaint' }));
          return;
        }
      }

      // Error
      const errorText = hfResp.buffer.toString('utf-8');
      console.error('[HF Inpaint] Error:', hfResp.status, errorText.substring(0, 500));
      res.writeHead(hfResp.status || 500, corsHeaders());
      res.end(JSON.stringify({ error: 'HF Inference API error', detail: errorText }));

    } catch(e) { 
      console.error('[HF Inpaint] ❌ Error:', e);
      res.writeHead(500, corsHeaders()); 
      res.end(JSON.stringify({ error: e.message })); 
    }
    return;
  }

  // ── SERVIR ARCHIVOS ESTÁTICOS ──
  let filePath = path.join(__dirname, reqPath === '/' ? 'index.html' : reqPath);
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404: ' + reqPath); return; }
    const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': mime });
    res.end(data);
  });
});

// Helper: Generar máscara por defecto (zona superior de la imagen)
async function generarMascaraDefault(personImageBase64) {
  // Extraer dimensiones de la imagen
  // Por simplicidad, generamos una máscara que cubre el 25% superior de la imagen
  // En producción, esto debería usar detección facial

  // Crear una imagen PNG negra con una zona blanca en la parte superior
  // Usamos canvas en el browser, acá generamos un PNG simple

  // Por ahora, retornamos una máscara generada en el browser
  // El browser enviará mask_data si puede generarla
  return null; // El frontend debe generar la máscara
}

server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║         CAPFIT — Dev Server           ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log(`║  Sitio:  http://localhost:${PORT}         ║`);
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  console.log('  Backends disponibles:');
  console.log('  1. HF Inpaint (gratuito): ', HF_TOKEN ? '✓ con token (300 req/hr)' : '⚠️ sin token (1 req/hr)');
  console.log('  2. fal.ai (pago):        ', FAL_KEY ? '✓ configurado' : '✗ no configurado');
  console.log('  3. Replicate:            ', REPLICATE_API_TOKEN ? '✓ configurado' : '✗ no configurado');
  console.log('');
});