/**
 * src/api/lib/http-helpers.js
 * Utilidades HTTP compartidas para Vercel Serverless y server.js local.
 */

const https = require('https');

const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6 MB límite

/**
 * Lee el stream del body con límite de tamaño estricto
 */
function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (Buffer.isBuffer(req.body)) return resolve(req.body);
      if (typeof req.body === 'string') return resolve(Buffer.from(req.body));
      if (typeof req.body === 'object') return resolve(Buffer.from(JSON.stringify(req.body)));
    }

    const chunks = [];
    let received = 0;

    req.on('data', chunk => {
      received += chunk.length;
      if (received > maxBytes) {
        const err = new Error(`La imagen o carga enviada supera el límite permitido de ${Math.round(maxBytes / (1024 * 1024))}MB. Por favor comprimí la imagen antes de subirla.`);
        err.statusCode = 413;
        req.destroy(err);
        return reject(err);
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Genera encabezados CORS con allowlist estricta basada en ALLOWED_ORIGINS
 */
function corsHeaders(req) {
  const origin = req ? (req.headers && req.headers.origin) : null;
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim().toLowerCase())
    .filter(Boolean);

  // Lista base permitida
  const defaultAllowed = [
    'https://capfit.store',
    'https://www.capfit.store',
    'https://account.capfit.store',
    'https://app.capfit.store',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ];

  let allowedOrigin = 'https://capfit.store';

  if (origin) {
    const lowOrigin = origin.toLowerCase();
    const isExplicitlyAllowed = envOrigins.includes(lowOrigin) || defaultAllowed.includes(lowOrigin);
    const isSubdomainOfCapfit = lowOrigin.endsWith('.capfit.store') && !lowOrigin.includes('..');
    const isDevPreview = lowOrigin.includes('run.app') || lowOrigin.includes('localhost') || lowOrigin.includes('127.0.0.1');

    if (isExplicitlyAllowed || isSubdomainOfCapfit || isDevPreview) {
      allowedOrigin = origin;
    }
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Store-Id,X-Store-Subdomain',
    'Vary': 'Origin'
  };
}

/**
 * Envío uniforme de respuestas JSON
 */
function sendJson(res, statusCode, data, req = null, extraHeaders = {}) {
  const headers = {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders
  };

  if (typeof res.status === 'function' && typeof res.json === 'function' && !res.writeHead) {
    // Modo helper Vercel/Express
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(statusCode).json(data);
  }

  // Modo nativo http.ServerResponse
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

/**
 * Petición HTTPS genérica para comunicarse con fal.ai y Anthropic
 */
function httpsReq(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.request({ hostname, path, method, headers }, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
        json() {
          try {
            return JSON.parse(this.body.toString());
          } catch (e) {
            return null;
          }
        }
      }));
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error('Timeout de conexión con servicio externo (60s)'));
    });

    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

/**
 * Pipe de respuesta HTTPS hacia la respuesta HTTP del cliente
 */
function proxyRequest(targetHost, targetPath, method, headers, body, res, req = null) {
  const proxyReq = https.request({ hostname: targetHost, path: targetPath, method, headers }, proxyRes => {
    const outHeaders = { ...corsHeaders(req) };
    if (proxyRes.headers['content-type']) {
      outHeaders['Content-Type'] = proxyRes.headers['content-type'];
    }
    res.writeHead(proxyRes.statusCode, outHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    if (!res.headersSent) {
      sendJson(res, 502, { error: 'Error de proxy externo: ' + err.message }, req);
    }
  });

  if (body && body.length > 0) proxyReq.write(body);
  proxyReq.end();
}

module.exports = {
  MAX_BODY_BYTES,
  readBody,
  corsHeaders,
  sendJson,
  httpsReq,
  proxyRequest
};
