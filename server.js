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

// Headers CORS para servidor de desarrollo local
function corsHeaders(req) {
  const origin = (req && req.headers && req.headers.origin) ? req.headers.origin : '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Store-Id',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function sendJson(res, status, data, req) {
  res.writeHead(status, {
    ...corsHeaders(req),
    'Content-Type': 'application/json'
  });
  res.end(JSON.stringify(data));
}

// Pre-carga estática de index.html:
// 1) Asegura que el analizador NFT (@vercel/nft) de Vercel detecte y empaquete index.html.
// 2) Mantiene index.html en memoria para servirlo instantáneamente con 0 latencia de disco.
let cachedIndexHtml = null;
try {
  cachedIndexHtml = fs.readFileSync(path.join(__dirname, 'index.html'));
} catch (e) {
  try {
    cachedIndexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'));
  } catch (err) {
    console.warn('[SERVER] Warning al precargar index.html:', err.message);
  }
}

function resolveStaticFile(reqPath) {
  const cleanPath = (reqPath === '/' ? 'index.html' : reqPath).replace(/^\/+/, '');
  const searchRoots = [
    __dirname,
    process.cwd(),
    path.resolve(__dirname, '..'),
    path.resolve(process.cwd(), '..')
  ];

  for (const root of searchRoots) {
    const candidate = path.join(root, cleanPath);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch (e) {}
  }
  return null;
}

// Reutilización centralizada del enrutador unificado de API (/api/*)
let handleApi = null;
try {
  handleApi = require('./src/api/router.js');
} catch (e) {
  try {
    handleApi = require('./src/api/router');
  } catch (err) {
    console.warn('[SERVER] Warning src/api/router:', err.message);
  }
}

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

    // 3. Favicon rápido
    if (reqPath === '/favicon.ico') {
      const fav = resolveStaticFile('assets/favicon.ico') || resolveStaticFile('favicon.ico');
      if (fav) {
        res.writeHead(200, { ...corsHeaders(req), 'Content-Type': 'image/x-icon' });
        res.end(fs.readFileSync(fav));
        return;
      }
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    // 4. Si es la raíz "/" o una ruta de vista SPA sin extensión (ej: /admin, /account, /shop, /404, etc.)
    const ext = path.extname(reqPath);
    const isSpaRoute = !ext || reqPath === '/' || reqPath === '/index.html' ||
      reqPath === '/404' || reqPath === '/admin' || reqPath === '/account' ||
      reqPath === '/app' || reqPath === '/shop' || reqPath === '/shpo' || reqPath === '/blog';

    if (isSpaRoute) {
      if (!cachedIndexHtml) {
        const p = resolveStaticFile('index.html');
        if (p) {
          try { cachedIndexHtml = fs.readFileSync(p); } catch (e) {}
        }
      }

      if (cachedIndexHtml) {
        res.writeHead(200, {
          ...corsHeaders(req),
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache'
        });
        res.end(cachedIndexHtml);
        return;
      }
    }

    // 5. Servir archivo estático físico (CSS, JS, imágenes, fuentes, etc.)
    const targetFile = resolveStaticFile(reqPath);
    if (targetFile) {
      try {
        const data = fs.readFileSync(targetFile);
        const fileExt = path.extname(targetFile).toLowerCase();
        const mime = MIME[fileExt] || 'application/octet-stream';
        const cacheHeader = (fileExt === '.html') ? 'no-cache' : 'public, max-age=86400';

        res.writeHead(200, {
          ...corsHeaders(req),
          'Content-Type': mime,
          'Cache-Control': cacheHeader
        });
        res.end(data);
        return;
      } catch (readErr) {
        console.error('[SERVER] Error leyendo archivo estático:', targetFile, readErr.message);
      }
    }

    // 6. Fallback a index.html si no es un archivo estático específico con extensión binaria
    if (cachedIndexHtml && !ext.match(/\.(png|jpg|jpeg|webp|gif|svg|glb|gltf|css|js|map|ico)$/i)) {
      res.writeHead(200, {
        ...corsHeaders(req),
        'Content-Type': 'text/html; charset=utf-8'
      });
      res.end(cachedIndexHtml);
      return;
    }

    // 7. 404 limpio
    res.writeHead(404, {
      ...corsHeaders(req),
      'Content-Type': 'text/plain; charset=utf-8'
    });
    res.end(`404: Archivo no encontrado (${reqPath})`);
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