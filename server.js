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

const StoreManager = require('./src/store-manager');
const FirebaseDb = require('./src/firebase-db');
StoreManager.init().catch(err => console.error('StoreManager init error:', err));

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
  '.svg':  'image/svg+xml',
};

// Reutilización centralizada del enrutador unificado de API (/api/*)
const { corsHeaders, sendJson } = require('./api/_lib/http-helpers');
const handleApi = require('./api/_router');

async function appHandler(req, res) {
  try {
    const parsed  = url.parse(req.url, true);
    const reqPath = parsed.pathname || '/';

    // 1. Manejo centralizado de API (/api/*)
    if (reqPath.startsWith('/api')) {
      return await handleApi(req, res);
    }

    // 2. Preflight CORS para otras peticiones si corresponde
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

  // ── Archivos estáticos ───────────────────────────────────
  if (reqPath === '/favicon.ico') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  let filePath = path.join(__dirname, reqPath === '/' ? 'index.html' : reqPath);
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Si la ruta no tiene extensión (o es /404, /admin, /account, /app, /shop, /shpo, /blog), servimos index.html para que el router de la app muestre la vista
      const ext = path.extname(reqPath);
      if (!ext || reqPath === '/404' || reqPath === '/admin' || reqPath === '/account' || reqPath === '/app' || reqPath === '/shop' || reqPath === '/shpo' || reqPath === '/blog') {
        fs.readFile(path.join(__dirname, 'index.html'), (errIndex, indexData) => {
          if (!errIndex) {
            res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'text/html; charset=utf-8' });
            res.end(indexData);
            return;
          }
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404: ' + reqPath);
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404: ' + reqPath);
      return;
    }
    const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { ...corsHeaders(), 'Content-Type': mime });
    res.end(data);
  });
  } catch (err) {
    console.error('[SERVER] Error no capturado en appHandler:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: err.message || 'Error interno del servidor' }, req);
    }
  }
}

const server = http.createServer(appHandler);

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
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
}

module.exports = appHandler;