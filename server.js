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
const MercadoPagoSubscriptions = require('./src/mercadopago-subscriptions');
const CustomerService = require('./src/customer-service');
const AuthGuard = require('./src/auth-guard');
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

const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6MB

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (!isNaN(contentLength) && contentLength > maxBytes) {
      const err = new Error('El tamaño de la solicitud excede el límite permitido (6MB).');
      err.statusCode = 413;
      return reject(err);
    }

    const chunks = [];
    let receivedBytes = 0;
    req.on('data', c => {
      receivedBytes += c.length;
      if (receivedBytes > maxBytes) {
        const err = new Error('El tamaño de la solicitud excede el límite permitido (6MB).');
        err.statusCode = 413;
        req.destroy();
        return reject(err);
      }
      chunks.push(c);
    });
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function corsHeaders(req) {
  const allowed = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : null;
  const origin = (req && req.headers && req.headers.origin) ? req.headers.origin : null;
  let allowOrigin = '*';
  if (allowed && allowed.length > 0) {
    if (origin && (allowed.includes(origin) || allowed.includes('*'))) {
      allowOrigin = origin;
    } else if (allowed.includes('*')) {
      allowOrigin = '*';
    } else {
      allowOrigin = allowed[0];
    }
  }
  return {
    'Access-Control-Allow-Origin':  allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Store-Id,X-Store-Subdomain,X-Capfit-Client,X-Requested-With,X-Admin-Token,X-Auth-Token',
    'Vary': 'Origin',
  };
}

function sendJson(res, statusCode, data, req) {
  res.writeHead(statusCode, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data));
}

function proxyRequest(targetHost, targetPath, method, headers, body, res, onStatus) {
  const proxyReq = https.request({ hostname: targetHost, path: targetPath, method, headers }, proxyRes => {
    if (typeof onStatus === 'function') onStatus(proxyRes.statusCode);
    const outHeaders = { ...corsHeaders() };
    if (proxyRes.headers['content-type']) outHeaders['Content-Type'] = proxyRes.headers['content-type'];
    res.writeHead(proxyRes.statusCode, outHeaders);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', err => {
    if (typeof onStatus === 'function') onStatus(502);
    if (!res.headersSent) {
      res.writeHead(502, corsHeaders());
      res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
    }
  });
  if (body && body.length > 0) proxyReq.write(body);
  proxyReq.end();
}

/**
 * Rate Limiter simple en memoria por IP (10 requests / minuto en endpoints de IA).
 * Suficiente para entornos serverless de un solo tenant.
 *
 * LIMITACIÓN CONOCIDA: En funciones serverless efímeras se resetea ante cold starts.
 * Para multi-instancia en escala, la interfaz está lista para migrar a Upstash/Redis:
 *   const count = await redis.incr(`ratelimit:${ip}`);
 *   if (count === 1) await redis.expire(`ratelimit:${ip}`, 60);
 */
const aiRateLimiter = {
  windowMs: 60 * 1000,
  maxRequests: 10,
  hits: new Map(),

  check(ip) {
    const now = Date.now();
    const entry = this.hits.get(ip);
    if (this.hits.size > 2000) {
      for (const [k, v] of this.hits.entries()) {
        if (now > v.resetTime) this.hits.delete(k);
      }
    }
    if (!entry || now > entry.resetTime) {
      this.hits.set(ip, { count: 1, resetTime: now + this.windowMs });
      return { allowed: true, remaining: this.maxRequests - 1, resetInMs: this.windowMs };
    }
    if (entry.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetInMs: Math.max(0, entry.resetTime - now) };
    }
    entry.count += 1;
    return { allowed: true, remaining: this.maxRequests - entry.count, resetInMs: Math.max(0, entry.resetTime - now) };
  }
};

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function logRequest(endpoint, status, durationMs, storeId, extra = '') {
  const suffix = extra ? ` note="${extra}"` : '';
  console.log(`[REQ] endpoint=${endpoint} status=${status} duration=${durationMs}ms storeId=${storeId}${suffix}`);
}


// Subir data URI al storage de fal.ai y obtener URL pública
function httpsReq(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.request({ hostname, path, method, headers }, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), json(){ return JSON.parse(this.body.toString()); } }));
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
  const ext = mimeType.includes('png') ? '.png' : mimeType.includes('webp') ? '.webp' : '.jpg';
  const fileName = 'upload_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + ext;
  const initBody = Buffer.from(JSON.stringify({
    file_name: fileName,
    content_type: mimeType,
    file_size: buffer.length
  }));
  const init = await httpsReq('rest.alpha.fal.ai', '/storage/upload/initiate', 'POST', {
    'Authorization': 'Key ' + falKey,
    'Content-Type':  'application/json',
    'Content-Length': initBody.length,
  }, initBody);
  if (init.status !== 200) {
    const errText = init.body ? init.body.toString() : String(init.status);
    throw new Error('Fal storage upload initiate falló: ' + errText);
  }
  const { upload_url, file_url } = init.json();
  const u = new URL(upload_url);
  const putRes = await httpsReq(u.hostname, u.pathname + u.search, 'PUT', {
    'Content-Type': mimeType,
    'Content-Length': buffer.length,
  }, buffer);
  if (putRes.status < 200 || putRes.status >= 300) {
    throw new Error('Fal storage upload PUT falló: ' + putRes.status);
  }
  return file_url;
}

function isAuthorizedClient(req) {
  const capfitClient = req.headers['x-capfit-client'];
  const requestedWith = req.headers['x-requested-with'];
  return capfitClient === 'capfit-web-v1' || requestedWith === 'XMLHttpRequest';
}

async function appHandler(req, res) {
  const parsed  = url.parse(req.url, true);
  const reqPath = parsed.pathname;
  const qs      = parsed.query;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders()); res.end(); return;
  }

  // Asegurar que la base de datos Firestore esté sincronizada antes de resolver tienda
  await StoreManager.ensureInitialized();

  // Resolver la tienda actual según host, subdominio o parámetro (?store=tienda1)
  const currentStore = StoreManager.resolveStoreFromRequest(req);

  const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
  const hostHdr = rawHost.toLowerCase().split(',')[0].trim().split(':')[0];


  const isCapfitDomain = hostHdr.endsWith('capfit.store');
  const isAdminDomain = hostHdr === 'admin.capfit.store' || hostHdr.startsWith('admin.');

  // Redirección hacia admin.capfit.store cuando se intenta acceder al panel/login desde una tienda pública
  if (isCapfitDomain && !isAdminDomain && (reqPath === '/admin' || reqPath === '/admin/' || reqPath === '/account' || reqPath === '/account/')) {
    res.writeHead(302, {
      'Location': 'https://admin.capfit.store/',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end();
    return;
  }

  // ── /api/anthropic ──────────────────────────────────────
  if (reqPath === '/api/anthropic') {
    const startTime = Date.now();
    if (!isAuthorizedClient(req)) {
      logRequest('/api/anthropic', 403, Date.now() - startTime, currentStore.id, 'unauthorized-client-call');
      res.writeHead(403, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Acceso no autorizado. Las solicitudes deben originarse desde la aplicación.' }));
      return;
    }
    const apiKey = process.env.ANTHROPIC_KEY || '';

    const clientIp = getClientIp(req);
    const rl = aiRateLimiter.check(clientIp);
    if (!rl.allowed) {
      const retrySec = Math.ceil(rl.resetInMs / 1000);
      logRequest('/api/anthropic', 429, Date.now() - startTime, currentStore.id, 'rate-limit');
      res.writeHead(429, {
        ...corsHeaders(req),
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(retrySec)
      });
      res.end(JSON.stringify({
        error: 'Demasiadas solicitudes. Por favor esperá un momento antes de volver a intentar.',
        retryAfterSeconds: retrySec
      }));
      return;
    }

    if (!apiKey) {
      logRequest('/api/anthropic', 500, Date.now() - startTime, currentStore.id, 'missing-anthropic-key');
      res.writeHead(500, corsHeaders(req));
      res.end(JSON.stringify({ error: 'ANTHROPIC_KEY no configurada en .env' }));
      return;
    }

    try {
      const body = await readBody(req);
      proxyRequest('api.anthropic.com', '/v1/messages', 'POST', {
        'Content-Type':      'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key':         apiKey,
        'Content-Length':    Buffer.byteLength(body),
      }, body, res, (statusCode) => {
        logRequest('/api/anthropic', statusCode, Date.now() - startTime, currentStore.id);
      });
    } catch(e) {
      const status = e.statusCode === 413 ? 413 : 500;
      logRequest('/api/anthropic', status, Date.now() - startTime, currentStore.id, e.message);
      res.writeHead(status, corsHeaders(req));
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── /api/gpt/edit → fal.ai con modelo openai/gpt-image-2.5 y fallback a gpt-image-2 ────
  if (reqPath === '/api/gpt/edit') {
    const startTime = Date.now();
    if (!isAuthorizedClient(req)) {
      logRequest('/api/gpt/edit', 403, Date.now() - startTime, currentStore.id, 'unauthorized-client-call');
      res.writeHead(403, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Acceso no autorizado. Las solicitudes deben originarse desde la aplicación.' }));
      return;
    }
    const falKey = process.env.FAL_KEY || '';

    // 1. Rate limiting por IP en endpoints de IA
    const clientIp = getClientIp(req);
    const rl = aiRateLimiter.check(clientIp);
    if (!rl.allowed) {
      const retrySec = Math.ceil(rl.resetInMs / 1000);
      logRequest('/api/gpt/edit', 429, Date.now() - startTime, currentStore.id, 'rate-limit');
      res.writeHead(429, {
        ...corsHeaders(req),
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(retrySec)
      });
      res.end(JSON.stringify({
        error: 'Demasiadas solicitudes. Por favor esperá un momento antes de volver a intentar.',
        retryAfterSeconds: retrySec
      }));
      return;
    }

    if (!falKey) {
      logRequest('/api/gpt/edit', 500, Date.now() - startTime, currentStore.id, 'missing-fal-key');
      res.writeHead(500, corsHeaders(req));
      res.end(JSON.stringify({ error: 'FAL_KEY no configurada en variables de entorno' }));
      return;
    }

    // 2. Lectura y validación de body (máximo 6MB)
    let payload;
    try {
      const rawBody = await readBody(req);
      try {
        payload = JSON.parse(rawBody.toString());
      } catch (parseErr) {
        logRequest('/api/gpt/edit', 400, Date.now() - startTime, currentStore.id, 'invalid-json');
        res.writeHead(400, corsHeaders(req));
        res.end(JSON.stringify({ error: 'JSON inválido en el cuerpo de la solicitud: ' + parseErr.message }));
        return;
      }
    } catch (bodyErr) {
      const status = bodyErr.statusCode === 413 ? 413 : 400;
      logRequest('/api/gpt/edit', status, Date.now() - startTime, currentStore.id, 'body-size-error');
      res.writeHead(status, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: bodyErr.message || 'Error al procesar el cuerpo de la solicitud' }));
      return;
    }

    // 3. Validación de campos requeridos (sin descontar cuota si es inválido)
    if (!payload.image_urls || !Array.isArray(payload.image_urls) || payload.image_urls.length === 0 || payload.image_urls.some(img => !img || typeof img !== 'string')) {
      logRequest('/api/gpt/edit', 400, Date.now() - startTime, currentStore.id, 'missing-images');
      res.writeHead(400, corsHeaders(req));
      res.end(JSON.stringify({ error: 'image_urls es requerido y debe ser un arreglo de imágenes válido' }));
      return;
    }

    // 4. Convertir imágenes base64 a URLs públicas de fal storage
    let publicImageUrls;
    try {
      publicImageUrls = await Promise.all(
        payload.image_urls.map(async (img) => {
          if (typeof img === 'string' && img.startsWith('data:')) {
            return await uploadDataURItoFal(img, falKey);
          }
          return img;
        })
      );
    } catch (uploadErr) {
      logRequest('/api/gpt/edit', 400, Date.now() - startTime, currentStore.id, 'storage-upload-failed');
      res.writeHead(400, corsHeaders(req));
      res.end(JSON.stringify({ error: 'Error al subir imágenes al almacenamiento de IA: ' + uploadErr.message }));
      return;
    }

    // 5. Verificación y descuento previo de cuota
    const quotaCheck = StoreManager.checkAndDeductAiCredit(currentStore.id);
    if (!quotaCheck.ok) {
      logRequest('/api/gpt/edit', 429, Date.now() - startTime, currentStore.id, 'quota-exceeded');
      res.writeHead(429, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: quotaCheck.message,
        code: 'MONTHLY_AI_LIMIT_REACHED',
        store: currentStore.name,
        subdomain: currentStore.subdomain,
        limit: quotaCheck.limit,
        used: quotaCheck.used,
        remaining: 0
      }));
      return;
    }

    let creditDeducted = true;

    try {
      const primaryRoute = (payload.model_route || 'openai/gpt-image-2.5/sunburst/edit').replace(/^\//, '');
      const fallbackRoute = (payload.fallback_route || 'openai/gpt-image-2/edit').replace(/^\//, '');

      const primaryPayload = {
        prompt: payload.prompt,
        image_urls: publicImageUrls,
        quality: payload.quality || 'medium',
        image_size: payload.image_size || 'auto',
        output_compression: payload.output_compression !== undefined ? payload.output_compression : 80,
        output_format: payload.output_format || 'jpeg',
      };
      const primaryBuffer = Buffer.from(JSON.stringify(primaryPayload));

      let falRes = await httpsReq('fal.run', '/' + primaryRoute, 'POST', {
        'Content-Type':   'application/json',
        'Authorization':  'Key ' + falKey,
        'Content-Length': primaryBuffer.length,
      }, primaryBuffer);

      const bodyStr = falRes.body ? falRes.body.toString() : '';
      const is404 = falRes.status === 404;
      const isModelNotFound = falRes.status === 400 && /model[_\s-]?not[_\s-]?found|invalid[_\s-]?model|unknown[_\s-]?model/i.test(bodyStr);
      const isAvailabilityError = (falRes.status === 503 || falRes.status === 422 || falRes.status === 502) &&
        /model|unavailable|not found|does not exist/i.test(bodyStr);

      if (is404 || isModelNotFound || isAvailabilityError) {
        const fallbackPayload = {
          prompt: payload.prompt,
          image_urls: publicImageUrls,
          quality: 'low',
          image_size: 'square',
          output_format: payload.output_format || 'jpeg',
        };
        const fallbackBuffer = Buffer.from(JSON.stringify(fallbackPayload));

        falRes = await httpsReq('fal.run', '/' + fallbackRoute, 'POST', {
          'Content-Type':   'application/json',
          'Authorization':  'Key ' + falKey,
          'Content-Length': fallbackBuffer.length,
        }, fallbackBuffer);
      }

      // Regla de cuota: descontar SOLO si fal.ai respondió status 200 (éxito).
      // Si fal respondió con error (5xx, timeout, 4xx payload error devuelto por fal), reintegrar.
      if (falRes.status === 200) {
        logRequest('/api/gpt/edit', 200, Date.now() - startTime, currentStore.id);
      } else {
        if (creditDeducted && typeof StoreManager.refundAiCredit === 'function') {
          StoreManager.refundAiCredit(currentStore.id);
          creditDeducted = false;
        }
        logRequest('/api/gpt/edit', falRes.status, Date.now() - startTime, currentStore.id, 'quota-refunded');
      }

      const outHeaders = { ...corsHeaders(req) };
      if (falRes.headers && falRes.headers['content-type']) {
        outHeaders['Content-Type'] = falRes.headers['content-type'];
      } else {
        outHeaders['Content-Type'] = 'application/json';
      }

      res.writeHead(falRes.status, outHeaders);
      res.end(falRes.body);

    } catch (e) {
      if (creditDeducted && typeof StoreManager.refundAiCredit === 'function') {
        StoreManager.refundAiCredit(currentStore.id);
        creditDeducted = false;
      }
      logRequest('/api/gpt/edit', 500, Date.now() - startTime, currentStore.id, 'network-or-execution-error');
      res.writeHead(500, corsHeaders(req));
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── /api/fal/submit ─────────────────────────────────────
  if (reqPath === '/api/fal/submit') {
    const startTime = Date.now();
    if (!isAuthorizedClient(req)) {
      logRequest('/api/fal/submit', 403, Date.now() - startTime, currentStore.id, 'unauthorized-client-call');
      res.writeHead(403, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Acceso no autorizado. Las solicitudes deben originarse desde la aplicación.' }));
      return;
    }
    const falKey = process.env.FAL_KEY || '';
    const model = qs.model || 'fal-ai/fashn/tryon/v1.5';

    // 1. Rate limiting por IP
    const clientIp = getClientIp(req);
    const rl = aiRateLimiter.check(clientIp);
    if (!rl.allowed) {
      const retrySec = Math.ceil(rl.resetInMs / 1000);
      logRequest('/api/fal/submit', 429, Date.now() - startTime, currentStore.id, 'rate-limit');
      res.writeHead(429, {
        ...corsHeaders(req),
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(retrySec)
      });
      res.end(JSON.stringify({
        error: 'Demasiadas solicitudes. Por favor esperá un momento antes de volver a intentar.',
        retryAfterSeconds: retrySec
      }));
      return;
    }

    if (!falKey) {
      logRequest('/api/fal/submit', 500, Date.now() - startTime, currentStore.id, 'missing-fal-key');
      res.writeHead(500, corsHeaders(req));
      res.end(JSON.stringify({ error: 'FAL_KEY no configurada en variables de entorno' }));
      return;
    }

    // 2. Lectura y validación de body (máx 6MB)
    let payload;
    try {
      const rawBody = await readBody(req);
      try {
        payload = JSON.parse(rawBody.toString());
      } catch (parseErr) {
        logRequest('/api/fal/submit', 400, Date.now() - startTime, currentStore.id, 'invalid-json');
        res.writeHead(400, corsHeaders(req));
        res.end(JSON.stringify({ error: 'JSON inválido en el cuerpo de la solicitud: ' + parseErr.message }));
        return;
      }
    } catch (bodyErr) {
      const status = bodyErr.statusCode === 413 ? 413 : 400;
      logRequest('/api/fal/submit', status, Date.now() - startTime, currentStore.id, 'body-size-error');
      res.writeHead(status, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: bodyErr.message || 'Error al procesar el cuerpo de la solicitud' }));
      return;
    }

    // 3. Validación de campos requeridos (sin descontar cuota si falló)
    if (!payload.model_image || !payload.garment_image) {
      logRequest('/api/fal/submit', 400, Date.now() - startTime, currentStore.id, 'missing-images');
      res.writeHead(400, corsHeaders(req));
      res.end(JSON.stringify({ error: 'model_image y garment_image son requeridos' }));
      return;
    }

    // 4. Subir imágenes base64 a fal.ai storage
    try {
      const [personURL, garmentURL] = await Promise.all([
        (typeof payload.model_image === 'string' && payload.model_image.startsWith('data:'))
          ? uploadDataURItoFal(payload.model_image, falKey)
          : payload.model_image,
        (typeof payload.garment_image === 'string' && payload.garment_image.startsWith('data:'))
          ? uploadDataURItoFal(payload.garment_image, falKey)
          : payload.garment_image,
      ]);
      payload.model_image = personURL;
      payload.garment_image = garmentURL;
    } catch (uploadErr) {
      logRequest('/api/fal/submit', 400, Date.now() - startTime, currentStore.id, 'storage-upload-failed');
      res.writeHead(400, corsHeaders(req));
      res.end(JSON.stringify({ error: 'Error al subir imágenes al almacenamiento de IA: ' + uploadErr.message }));
      return;
    }

    // 5. Control y descuento de cuota
    const quotaCheck = StoreManager.checkAndDeductAiCredit(currentStore.id);
    if (!quotaCheck.ok) {
      logRequest('/api/fal/submit', 429, Date.now() - startTime, currentStore.id, 'quota-exceeded');
      res.writeHead(429, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: quotaCheck.message,
        code: 'MONTHLY_AI_LIMIT_REACHED',
        store: currentStore.name,
        subdomain: currentStore.subdomain,
        limit: quotaCheck.limit,
        used: quotaCheck.used,
        remaining: 0
      }));
      return;
    }

    let creditDeducted = true;

    try {
      const newBody = Buffer.from(JSON.stringify(payload));
      const falRes = await httpsReq('queue.fal.run', '/' + model, 'POST', {
        'Content-Type':   'application/json',
        'Content-Length': newBody.length,
        'Authorization':  'Key ' + falKey,
      }, newBody);

      if (falRes.status === 200 || falRes.status === 201) {
        logRequest('/api/fal/submit', falRes.status, Date.now() - startTime, currentStore.id);
      } else {
        if (creditDeducted && typeof StoreManager.refundAiCredit === 'function') {
          StoreManager.refundAiCredit(currentStore.id);
          creditDeducted = false;
        }
        logRequest('/api/fal/submit', falRes.status, Date.now() - startTime, currentStore.id, 'quota-refunded');
      }

      const outHeaders = { ...corsHeaders(req) };
      if (falRes.headers && falRes.headers['content-type']) {
        outHeaders['Content-Type'] = falRes.headers['content-type'];
      } else {
        outHeaders['Content-Type'] = 'application/json';
      }

      res.writeHead(falRes.status, outHeaders);
      res.end(falRes.body);

    } catch(e) {
      if (creditDeducted && typeof StoreManager.refundAiCredit === 'function') {
        StoreManager.refundAiCredit(currentStore.id);
        creditDeducted = false;
      }
      logRequest('/api/fal/submit', 500, Date.now() - startTime, currentStore.id, 'network-or-execution-error');
      res.writeHead(500, corsHeaders(req));
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── /api/fal/status ─────────────────────────────────────
  if (reqPath === '/api/fal/status') {
    const startTime = Date.now();
    const falKey = process.env.FAL_KEY || '';
    const model  = qs.model  || 'fal-ai/fashn/tryon/v1.5';
    const reqId  = qs.reqId  || '';
    try {
      proxyRequest('queue.fal.run', '/' + model + '/requests/' + reqId + '/status', 'GET', {
        'Authorization': 'Key ' + falKey,
      }, null, res, (status) => {
        logRequest('/api/fal/status', status, Date.now() - startTime, currentStore.id);
      });
    } catch(e) {
      logRequest('/api/fal/status', 500, Date.now() - startTime, currentStore.id);
      res.writeHead(500, corsHeaders(req));
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── /api/fal/result ─────────────────────────────────────
  if (reqPath === '/api/fal/result') {
    const startTime = Date.now();
    const falKey = process.env.FAL_KEY || '';
    const model  = qs.model || 'fal-ai/fashn/tryon/v1.5';
    const reqId  = qs.reqId || '';
    try {
      proxyRequest('queue.fal.run', '/' + model + '/requests/' + reqId, 'GET', {
        'Authorization': 'Key ' + falKey,
      }, null, res, (status) => {
        logRequest('/api/fal/result', status, Date.now() - startTime, currentStore.id);
      });
    } catch(e) {
      logRequest('/api/fal/result', 500, Date.now() - startTime, currentStore.id);
      res.writeHead(500, corsHeaders(req));
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── BACKOFFICE & STORE API ROUTES ──────────────────────────

  // 0. GET /api/store/current (Información de la tienda activa y su cuota mensual de IA)
  if (reqPath === '/api/store/current' && req.method === 'GET') {
    const quota = StoreManager.getAiQuotaStatus(currentStore.id);
    sendJson(res, 200, {
      ok: true,
      store: {
        id: currentStore.id,
        subdomain: currentStore.subdomain,
        fullDomain: currentStore.fullDomain || `${currentStore.subdomain}.capfit.store`,
        name: currentStore.name,
        tagline: currentStore.tagline,
        plan: currentStore.plan || 'Starter',
        brandColor: currentStore.brandColor || '#111111'
      },
      aiQuota: quota
    });
    return;
  }

  // 0.1 GET /api/stores (Listado público de tiendas disponibles para previsualizar/cambiar)
  if (reqPath === '/api/stores' && req.method === 'GET') {
    const all = StoreManager.getAllStores();
    const publicList = all.map(s => ({
      id: s.id,
      subdomain: s.subdomain,
      fullDomain: s.fullDomain || `${s.subdomain}.capfit.store`,
      name: s.name,
      tagline: s.tagline,
      about: s.about || null,
      plan: s.plan,
      aiQuota: StoreManager.getAiQuotaStatus(s.id),
      active: s.active
    }));
    sendJson(res, 200, publicList);
    return;
  }

  // 0.15 GET /api/analytics-config (Configuración de Google Analytics 4)
  if (reqPath === '/api/analytics-config' && req.method === 'GET') {
    const measurementId = process.env.GA_MEASUREMENT_ID || 'G-RJFGW1349J';
    sendJson(res, 200, { ok: true, measurementId });
    return;
  }

  // 0.2 GET & PUT /api/stores/:id/about (Sección Sobre Nosotros sincronizada con Firebase Firestore)
  if (reqPath.startsWith('/api/stores/') && reqPath.endsWith('/about')) {
    const parts = reqPath.split('/');
    const storeTargetId = decodeURIComponent(parts[3] || '');
    const store = StoreManager.getStoreById(storeTargetId);
    if (!store) {
      sendJson(res, 404, { error: 'Tienda no encontrada' });
      return;
    }

    if (req.method === 'GET') {
      const sections = StoreManager.getStoreSections(store.id);
      sendJson(res, 200, { ok: true, storeId: store.id, about: (sections && sections.about) || store.about || null });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      if (!AuthGuard.canManageStore(auth, store.id)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para modificar la tienda "${store.id}".` });
        return;
      }
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw.toString() || '{}');
        const updatedSections = StoreManager.updateStoreSections(store.id, 'about', body);
        sendJson(res, 200, {
          ok: true,
          storeId: store.id,
          about: updatedSections.about,
          message: 'Sobre Nosotros sincronizado exitosamente con Firebase Firestore'
        });
      } catch (err) {
        sendJson(res, 400, { error: err.message || 'Error al guardar sobre nosotros' });
      }
      return;
    }
  }

  // 0.3 GET & PUT /api/stores/:id/sections (Todas las secciones informativas: about, faq, envios, cambios, contacto, terminos, privacidad)
  if (reqPath.startsWith('/api/stores/') && reqPath.endsWith('/sections')) {
    const parts = reqPath.split('/');
    const storeTargetId = decodeURIComponent(parts[3] || '');
    let store = StoreManager.getStoreById(storeTargetId) || StoreManager.getStoreBySubdomain(storeTargetId);
    if (!store && (storeTargetId.startsWith('ais-') || storeTargetId === 'principal')) {
      store = StoreManager.getStoreById('principal') || StoreManager.getAllStores()[0];
    }
    if (!store) {
      sendJson(res, 404, { error: 'Tienda no encontrada' });
      return;
    }

    if (req.method === 'GET') {
      const sections = StoreManager.getStoreSections(store.id);
      sendJson(res, 200, { ok: true, storeId: store.id, sections });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      if (!AuthGuard.canManageStore(auth, store.id)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para modificar las secciones de "${store.id}".` });
        return;
      }
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw.toString() || '{}');
        let updatedSections;
        if (body.sectionKey && body.data) {
          updatedSections = StoreManager.updateStoreSections(store.id, body.sectionKey, body.data);
        } else {
          updatedSections = StoreManager.updateStoreSections(store.id, null, body);
        }
        sendJson(res, 200, {
          ok: true,
          storeId: store.id,
          sections: updatedSections,
          message: 'Secciones guardadas y sincronizadas con Firebase Firestore'
        });
      } catch (err) {
        sendJson(res, 400, { error: err.message || 'Error al guardar secciones' });
      }
      return;
    }
  }

  // 1. POST /api/admin/login (Login SuperAdmin o Dueño de Tienda validado contra store_secrets / ADMIN_PASSWORD)
  if (reqPath === '/api/admin/login' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { username, password, storeId } = JSON.parse(raw.toString() || '{}');
      const expectedSuperPassword = (process.env.ADMIN_PASSWORD || '').trim();
      const cleanPass = (password || '').trim();
      const cleanUser = (username || '').trim();
      const cleanStoreId = (storeId && typeof storeId === 'string' && !storeId.startsWith('ais-')) ? storeId.trim() : '';

      if (!cleanPass) {
        sendJson(res, 400, { ok: false, error: 'Por favor, ingresá la contraseña.' });
        return;
      }

      // Rechazar explícitamente contraseñas de demostración históricas
      const forbiddenDemoPasswords = ['123456', 'tienda1pass', 'tienda2pass', 'capfit2026'];
      if (forbiddenDemoPasswords.includes(cleanPass) && (!expectedSuperPassword || cleanPass !== expectedSuperPassword)) {
        sendJson(res, 401, {
          ok: false,
          error: 'Las contraseñas de prueba están deshabilitadas. Iniciá sesión con tu cuenta verificada o tus credenciales privadas.'
        });
        return;
      }

      const allStores = StoreManager.getAllStores();

      // Función auxiliar para saber si un identificador coincide con una tienda
      function matchesStoreIdentifier(st, ident) {
        if (!st || !ident) return false;
        const low = ident.toLowerCase();
        if (st.id && st.id.toLowerCase() === low) return true;
        if (st.subdomain && st.subdomain.toLowerCase() === low) return true;
        if (st.ownerEmail && st.ownerEmail.toLowerCase() === low) return true;
        if (st.name && st.name.toLowerCase() === low) return true;
        if (st.id && `admin_${st.id.toLowerCase()}` === low) return true;
        if (st.subdomain && `admin_${st.subdomain.toLowerCase()}` === low) return true;
        if (low.startsWith('admin_') && low.replace('admin_', '') === st.id.toLowerCase()) return true;
        return false;
      }

      // 1. Verificar si es login de SuperAdmin con clave maestra configurada en variable de entorno
      const superadminEmail = (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com').toLowerCase().trim();
      const isSuperAdminUser = !cleanUser || cleanUser.toLowerCase() === 'admin' || cleanUser.toLowerCase() === 'superadmin' || cleanUser.toLowerCase() === 'admin@capfit.shop' || cleanUser.toLowerCase() === superadminEmail;

      if (expectedSuperPassword && cleanPass === expectedSuperPassword) {
        let targetStore = null;
        if (cleanUser && !isSuperAdminUser) {
          targetStore = allStores.find(s => matchesStoreIdentifier(s, cleanUser));
        }
        if (!targetStore && cleanStoreId) {
          targetStore = StoreManager.getStoreById(cleanStoreId) || StoreManager.getStoreBySubdomain(cleanStoreId);
        }
        if (!targetStore) {
          targetStore = (currentStore && currentStore.id !== 'principal' ? currentStore : null) || StoreManager.getStoreById('principal') || allStores[0];
        }

        const resolvedStoreId = targetStore ? targetStore.id : 'principal';
        const signedToken = AuthGuard.signSessionToken({
          uid: 'superadmin',
          email: superadminEmail,
          role: 'superadmin',
          storeId: resolvedStoreId,
          ownedStoreIds: allStores.map(s => s.id)
        });

        sendJson(res, 200, {
          ok: true,
          role: 'superadmin',
          storeId: resolvedStoreId,
          subdomain: targetStore ? targetStore.subdomain : 'capfit',
          storeName: targetStore ? targetStore.name : 'CAPFIT Platform Admin',
          token: signedToken,
          message: `Autenticación exitosa como Administrador de la Plataforma (${targetStore ? targetStore.name : 'CAPFIT'})`
        });
        return;
      }

      // 2. Verificar credenciales de tienda específica contra store_secrets
      let candidateStores = [];
      if (cleanUser) {
        candidateStores = allStores.filter(s => matchesStoreIdentifier(s, cleanUser));
      }
      if (cleanStoreId) {
        const explicitStore = StoreManager.getStoreById(cleanStoreId) || StoreManager.getStoreBySubdomain(cleanStoreId);
        if (explicitStore && !candidateStores.some(s => s.id === explicitStore.id)) {
          candidateStores.push(explicitStore);
        }
      }
      if (currentStore && currentStore.id !== 'principal' && !candidateStores.some(s => s.id === currentStore.id)) {
        candidateStores.push(currentStore);
      }

      let matchedStore = null;
      for (const st of candidateStores) {
        const check = await StoreManager.verifyStoreCredentials(st.id, cleanUser, cleanPass);
        if (check && check.valid) {
          matchedStore = st;
          break;
        }
      }

      if (matchedStore) {
        const signedToken = AuthGuard.signSessionToken({
          uid: matchedStore.ownerUid || `owner:${matchedStore.id}`,
          email: matchedStore.ownerEmail || cleanUser,
          role: 'store_owner',
          storeId: matchedStore.id,
          ownedStoreIds: [matchedStore.id]
        });

        sendJson(res, 200, {
          ok: true,
          role: 'store_owner',
          storeId: matchedStore.id,
          subdomain: matchedStore.subdomain,
          storeName: matchedStore.name,
          plan: matchedStore.plan || 'Starter',
          token: signedToken,
          message: `Bienvenido al panel de ${matchedStore.name}`
        });
        return;
      }

      sendJson(res, 401, {
        ok: false,
        error: 'Credenciales inválidas. Comprobá el usuario/email y contraseña de tu tienda.'
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Datos de login inválidos: ' + e.message });
    }
    return;
  }

  // 1.05 POST /api/admin/auth/firebase-verify (Verificación criptográfica de Firebase ID Token y emisión de sesión HMAC)
  if (reqPath === '/api/admin/auth/firebase-verify' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const idToken = AuthGuard.extractTokenFromRequest(req) || body.idToken || '';

      if (!idToken) {
        sendJson(res, 401, { ok: false, error: 'Token de identidad Firebase (idToken) requerido para verificar la sesión.' });
        return;
      }

      const verifiedToken = await AuthGuard.verifyFirebaseIdToken(idToken);
      if (!verifiedToken.verified) {
        sendJson(res, 401, { ok: false, error: verifiedToken.error });
        return;
      }

      const uid = verifiedToken.uid;
      const cleanEmail = verifiedToken.email;
      const displayName = body.displayName || verifiedToken.name || '';
      const photoURL = body.photoURL || verifiedToken.picture || '';
      const verifiedClaims = verifiedToken.claims || {};

      const superadminEmail = (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com').toLowerCase().trim();
      const targetStoreId = body.targetStoreId || null;
      const cleanTargetStoreId = (targetStoreId && typeof targetStoreId === 'string' && !targetStoreId.startsWith('ais-')) ? targetStoreId.trim() : null;

      // 1. Consultar documento del usuario en Firestore directamente desde el servidor (nunca confiar en firestoreUserData del body)
      let ownerDoc = null;
      if (FirebaseDb && typeof FirebaseDb.getStoreOwner === 'function') {
        try {
          ownerDoc = await FirebaseDb.getStoreOwner(uid);
        } catch (dbErr) {
          console.warn('[firebase-verify] No se pudo leer store_owners doc:', dbErr.message);
        }
      }

      // 2. Extraer storeId y rol validados desde Custom Claims firmados en el JWT o Documento de Firestore
      const claimStoreId = verifiedClaims.storeId || verifiedClaims.store_id || null;
      const claimRole = verifiedClaims.role || (verifiedClaims.admin === true ? 'superadmin' : null);

      const docStoreId = ownerDoc ? (ownerDoc.storeId || (Array.isArray(ownerDoc.stores) && ownerDoc.stores[0])) : null;
      const docRole = ownerDoc ? ownerDoc.role : null;

      const allStores = StoreManager.getAllStores();
      const ownedStores = StoreManager.findStoresByOwner({ email: cleanEmail, uid });

      // Determinar si el usuario es SuperAdmin
      const isSuperAdmin = (claimRole === 'superadmin') || (docRole === 'superadmin') || (cleanEmail === superadminEmail) || (cleanEmail === 'admin@capfit.shop');

      // Determinar tiendas que este usuario posee legítimamente
      const validOwnedStoreIds = new Set(ownedStores.map(s => s.id));
      if (claimStoreId) validOwnedStoreIds.add(String(claimStoreId));
      if (docStoreId) validOwnedStoreIds.add(String(docStoreId));

      let targetStore = null;
      if (claimStoreId || docStoreId) {
        const preferredId = claimStoreId || docStoreId;
        targetStore = StoreManager.getStoreById(preferredId) || StoreManager.getStoreBySubdomain(preferredId);
      }
      if (!targetStore && cleanTargetStoreId) {
        const requestedStore = StoreManager.getStoreById(cleanTargetStoreId) || StoreManager.getStoreBySubdomain(cleanTargetStoreId);
        // Solo permitir seleccionar targetStoreId si el usuario es dueño de esa tienda o es SuperAdmin
        if (requestedStore && (isSuperAdmin || validOwnedStoreIds.has(requestedStore.id))) {
          targetStore = requestedStore;
        }
      }
      if (!targetStore && ownedStores.length > 0) {
        targetStore = ownedStores[0];
      }

      // 3. Caso: Store Owner validado por Custom Claims, Documento Firestore o Propiedad de Tienda
      if (targetStore && validOwnedStoreIds.has(targetStore.id) && !isSuperAdmin) {
        StoreManager.linkStoreOwner({
          storeId: targetStore.id,
          uid,
          email: cleanEmail,
          displayName: displayName || targetStore.name,
          role: 'store_owner'
        });

        const signedToken = AuthGuard.signSessionToken({
          uid,
          email: cleanEmail,
          role: 'store_owner',
          storeId: targetStore.id,
          ownedStoreIds: Array.from(validOwnedStoreIds)
        });

        sendJson(res, 200, {
          ok: true,
          role: 'store_owner',
          storeId: targetStore.id,
          subdomain: targetStore.subdomain,
          storeName: targetStore.name,
          plan: targetStore.plan || 'Starter',
          verifiedVia: claimStoreId ? 'custom_claims' : (docStoreId ? 'firestore_document' : 'store_ownership'),
          token: signedToken,
          user: { uid, email: cleanEmail, displayName: displayName || targetStore.name, photoURL },
          message: `Acceso concedido a ${targetStore.name} (${targetStore.subdomain}.capfit.store)`
        });
        return;
      }

      // 4. Caso: SuperAdmin de la plataforma
      if (isSuperAdmin) {
        const storeToManage = targetStore || StoreManager.getStoreById('principal') || allStores[0];
        const resolvedStoreId = storeToManage ? storeToManage.id : 'principal';
        const signedToken = AuthGuard.signSessionToken({
          uid,
          email: cleanEmail,
          role: 'superadmin',
          storeId: resolvedStoreId,
          ownedStoreIds: allStores.map(s => s.id)
        });

        sendJson(res, 200, {
          ok: true,
          role: 'superadmin',
          storeId: resolvedStoreId,
          subdomain: storeToManage ? storeToManage.subdomain : 'capfit',
          storeName: storeToManage ? storeToManage.name : 'CAPFIT Platform Admin',
          token: signedToken,
          user: { uid, email: cleanEmail, displayName: displayName || 'SuperAdmin', photoURL },
          message: `Autenticación exitosa como Administrador de la Plataforma (${storeToManage ? storeToManage.name : 'CAPFIT'})`
        });
        return;
      }

      // 5. Caso: Usuario autenticado pero aún no tiene tienda registrada como dueño ni claims asignados
      sendJson(res, 200, {
        ok: false,
        code: 'NO_STORE_REGISTERED',
        error: 'Tu usuario está autenticado con Firebase Auth, pero aún no tiene una tienda registrada como Dueño.',
        user: { uid, email: cleanEmail, displayName, photoURL }
      });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 1.06 POST /api/admin/auth/firebase-register (Registro de nueva tienda para Dueño vía Firebase Auth verificado)
  if (reqPath === '/api/admin/auth/firebase-register' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const { displayName, storeName, subdomain, tagline } = body;
      const idToken = AuthGuard.extractTokenFromRequest(req) || body.idToken || '';

      if (!idToken) {
        sendJson(res, 401, { ok: false, error: 'Se requiere token de identidad Firebase Auth (idToken) verificado.' });
        return;
      }

      const verifiedToken = await AuthGuard.verifyFirebaseIdToken(idToken);
      if (!verifiedToken.verified) {
        sendJson(res, 401, { ok: false, error: verifiedToken.error });
        return;
      }

      const uid = verifiedToken.uid;
      const cleanEmail = verifiedToken.email;

      if (!subdomain || !storeName) {
        sendJson(res, 400, { ok: false, error: 'El nombre de la tienda y el subdominio son obligatorios.' });
        return;
      }

      // Verificar que el subdominio no pertenezca ya a otra tienda existente
      const cleanSubCheck = String(subdomain).toLowerCase().trim().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
      const existingStore = StoreManager.getStoreById(cleanSubCheck);
      if (existingStore && existingStore.ownerUid && existingStore.ownerUid !== uid) {
        sendJson(res, 409, { ok: false, error: `El subdominio "${cleanSubCheck}" ya está registrado por otra tienda.` });
        return;
      }

      // Toda tienda auto-registrada inicia en el plan gratuito ('free') hasta confirmar pago por pasarela
      const newStore = StoreManager.createStore({
        subdomain,
        name: storeName,
        username: subdomain.toLowerCase().replace(/[^a-z0-9]/g, ''),
        ownerEmail: cleanEmail,
        ownerUid: uid,
        plan: 'free',
        tagline: tagline || `Tienda oficial de gorras de ${storeName}`
      });

      StoreManager.linkStoreOwner({
        storeId: newStore.id,
        uid,
        email: cleanEmail,
        displayName: displayName || verifiedToken.name || storeName,
        role: 'store_owner'
      });

      const signedToken = AuthGuard.signSessionToken({
        uid,
        email: cleanEmail,
        role: 'store_owner',
        storeId: newStore.id,
        ownedStoreIds: [newStore.id]
      });

      sendJson(res, 201, {
        ok: true,
        role: 'store_owner',
        storeId: newStore.id,
        subdomain: newStore.subdomain,
        storeName: newStore.name,
        plan: newStore.plan,
        store: newStore,
        token: signedToken,
        message: `¡Tienda "${newStore.name}" creada exitosamente! Subdominio: ${newStore.subdomain}.capfit.store`
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // ── CUSTOMER & CAPFIT ID API ENDPOINTS ──

  // POST /api/customer/sync-session (Sincronización CapFit ID + Reconocimiento Dueño de Tienda Opción A)
  if (reqPath === '/api/customer/sync-session' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const idToken = AuthGuard.extractTokenFromRequest(req) || body.idToken || '';

      const auth = idToken && idToken.startsWith('capfit_sess.')
        ? await AuthGuard.authenticateRequest(req)
        : (idToken ? await AuthGuard.verifyFirebaseIdToken(idToken) : { verified: false });

      const isVerified = Boolean(auth && (auth.authenticated || auth.verified));
      if (!isVerified) {
        sendJson(res, 401, { ok: false, error: 'Token de identidad Firebase requerido para sincronizar sesión de comprador.' });
        return;
      }

      const verifiedUid = auth.uid;
      const verifiedEmail = auth.email || (body.email || '').toLowerCase().trim();
      if (body.uid && String(body.uid) !== String(verifiedUid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para sincronizar la sesión de otro usuario.' });
        return;
      }

      const { displayName, phone, dni, photoURL, currentStoreId } = body;
      const effectiveStoreId = currentStoreId || req.headers['x-store-id'] || currentStore.id || 'principal';
      const result = await CustomerService.syncSession({
        uid: verifiedUid,
        email: verifiedEmail,
        displayName: displayName || auth.name || '',
        phone,
        dni,
        photoURL: photoURL || auth.picture || '',
        currentStoreId: effectiveStoreId
      });

      sendJson(res, 200, result);
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // GET /api/customer/profile?uid=...
  if (reqPath === '/api/customer/profile' && req.method === 'GET') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const uid = qs.uid || auth.uid;
      const storeId = qs.storeId || currentStore.id || 'principal';
      if (!uid) {
        sendJson(res, 400, { ok: false, error: 'uid requerido' });
        return;
      }
      if (String(auth.uid) !== String(uid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para consultar el perfil de otro usuario.' });
        return;
      }
      const user = await CustomerService.getUser(uid);
      if (!user) {
        sendJson(res, 404, { ok: false, error: 'Usuario no encontrado' });
        return;
      }
      const storeCustomer = await CustomerService.getStoreCustomer(storeId, uid);
      sendJson(res, 200, { ok: true, user, storeCustomer });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // PUT /api/customer/profile
  if (reqPath === '/api/customer/profile' && req.method === 'PUT') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const raw = await readBody(req);
      const { uid: bodyUid, displayName, phone, dni, fitProfile } = JSON.parse(raw.toString() || '{}');
      const uid = bodyUid || auth.uid;
      if (!uid) {
        sendJson(res, 400, { ok: false, error: 'uid requerido' });
        return;
      }
      if (String(auth.uid) !== String(uid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para modificar el perfil de otro usuario.' });
        return;
      }
      const updates = {};
      if (displayName !== undefined) updates.displayName = displayName;
      if (phone !== undefined) updates.phone = phone;
      if (dni !== undefined) updates.dni = dni;
      if (fitProfile !== undefined) {
        updates.fitProfile = {
          headCircumferenceCm: fitProfile.headCircumferenceCm !== undefined ? Number(fitProfile.headCircumferenceCm) : null,
          preferredStyles: Array.isArray(fitProfile.preferredStyles) ? fitProfile.preferredStyles : [],
          fittedSize: fitProfile.fittedSize || ''
        };
      }
      await CustomerService.saveUser(uid, updates);
      const updatedUser = await CustomerService.getUser(uid);
      sendJson(res, 200, { ok: true, user: updatedUser });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // POST /api/customer/selfies (Guardar selfie validada para el probador en CapFit ID)
  if (reqPath === '/api/customer/selfies' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const raw = await readBody(req);
      const { uid: bodyUid, selfie } = JSON.parse(raw.toString() || '{}');
      const uid = bodyUid || auth.uid;
      if (!uid || !selfie || !selfie.imageUrl) {
        sendJson(res, 400, { ok: false, error: 'uid y selfie con imageUrl son requeridos' });
        return;
      }
      if (String(auth.uid) !== String(uid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para modificar las selfies de otro usuario.' });
        return;
      }
      const user = (await CustomerService.getUser(uid)) || { baseSelfies: [] };
      let selfies = Array.isArray(user.baseSelfies) ? [...user.baseSelfies] : [];
      const selfieId = selfie.id || `selfie_${Date.now()}`;
      const isDefault = selfie.isDefault !== false;

      if (isDefault) {
        selfies = selfies.map(s => ({ ...s, isDefault: false }));
      }

      const newSelfie = {
        id: selfieId,
        imageUrl: selfie.imageUrl,
        isDefault,
        uploadedAt: new Date().toISOString()
      };

      const existingIdx = selfies.findIndex(s => s.id === selfieId);
      if (existingIdx >= 0) {
        selfies[existingIdx] = newSelfie;
      } else {
        selfies.unshift(newSelfie);
      }

      await CustomerService.saveUser(uid, { baseSelfies: selfies });
      sendJson(res, 200, { ok: true, baseSelfies: selfies, newSelfie });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // DELETE /api/customer/selfies
  if (reqPath === '/api/customer/selfies' && req.method === 'DELETE') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const uid = body.uid || qs.uid || auth.uid;
      const selfieId = body.selfieId || qs.selfieId;

      if (!uid || !selfieId) {
        sendJson(res, 400, { ok: false, error: 'uid y selfieId son requeridos' });
        return;
      }
      if (String(auth.uid) !== String(uid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para eliminar selfies de otro usuario.' });
        return;
      }

      const user = await CustomerService.getUser(uid);
      if (!user) {
        sendJson(res, 404, { ok: false, error: 'Usuario no encontrado' });
        return;
      }

      let selfies = Array.isArray(user.baseSelfies) ? user.baseSelfies.filter(s => s.id !== selfieId) : [];
      if (selfies.length > 0 && !selfies.some(s => s.isDefault)) {
        selfies[0].isDefault = true;
      }

      await CustomerService.saveUser(uid, { baseSelfies: selfies });
      sendJson(res, 200, { ok: true, baseSelfies: selfies });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // POST /api/customer/addresses (Guardar o actualizar dirección de entrega)
  if (reqPath === '/api/customer/addresses' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const raw = await readBody(req);
      const { uid: bodyUid, address } = JSON.parse(raw.toString() || '{}');
      const uid = bodyUid || auth.uid;
      if (!uid || !address || !address.street) {
        sendJson(res, 400, { ok: false, error: 'uid y datos de dirección son requeridos' });
        return;
      }
      if (String(auth.uid) !== String(uid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para modificar las direcciones de otro usuario.' });
        return;
      }

      const user = (await CustomerService.getUser(uid)) || { addresses: [] };
      let addresses = Array.isArray(user.addresses) ? [...user.addresses] : [];
      const addrId = address.id || `addr_${Date.now()}`;
      const isDefault = address.isDefault || addresses.length === 0;

      if (isDefault) {
        addresses = addresses.map(a => ({ ...a, isDefault: false }));
      }

      const newAddress = {
        id: addrId,
        alias: address.alias || 'Mi Dirección',
        recipientName: address.recipientName || user.displayName || '',
        street: address.street,
        number: address.number || '',
        floorApt: address.floorApt || '',
        city: address.city || '',
        province: address.province || '',
        postalCode: address.postalCode || '',
        isDefault
      };

      const existingIdx = addresses.findIndex(a => a.id === addrId);
      if (existingIdx >= 0) {
        addresses[existingIdx] = newAddress;
      } else {
        addresses.push(newAddress);
      }

      await CustomerService.saveUser(uid, { addresses });
      sendJson(res, 200, { ok: true, addresses, newAddress });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // DELETE /api/customer/addresses
  if (reqPath === '/api/customer/addresses' && req.method === 'DELETE') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const uid = body.uid || qs.uid || auth.uid;
      const addressId = body.addressId || qs.addressId;

      if (!uid || !addressId) {
        sendJson(res, 400, { ok: false, error: 'uid y addressId son requeridos' });
        return;
      }
      if (String(auth.uid) !== String(uid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para eliminar direcciones de otro usuario.' });
        return;
      }

      const user = await CustomerService.getUser(uid);
      if (!user) {
        sendJson(res, 404, { ok: false, error: 'Usuario no encontrado' });
        return;
      }

      let addresses = Array.isArray(user.addresses) ? user.addresses.filter(a => a.id !== addressId) : [];
      if (addresses.length > 0 && !addresses.some(a => a.isDefault)) {
        addresses[0].isDefault = true;
      }

      await CustomerService.saveUser(uid, { addresses });
      sendJson(res, 200, { ok: true, addresses });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // POST /api/customer/wishlist (Alternar producto en lista de deseos del tenant)
  if (reqPath === '/api/customer/wishlist' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const raw = await readBody(req);
      const { uid: bodyUid, storeId, productId, action } = JSON.parse(raw.toString() || '{}');
      const uid = bodyUid || auth.uid;
      const targetStoreId = storeId || currentStore.id || 'principal';

      if (!uid || !productId) {
        sendJson(res, 400, { ok: false, error: 'uid y productId son requeridos' });
        return;
      }
      if (String(auth.uid) !== String(uid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para modificar la lista de deseos de otro usuario.' });
        return;
      }

      const storeCustomer = (await CustomerService.getStoreCustomer(targetStoreId, uid)) || {
        storeId: targetStoreId,
        userId: uid,
        wishlistProductIds: []
      };

      let wishlist = Array.isArray(storeCustomer.wishlistProductIds) ? [...storeCustomer.wishlistProductIds] : [];
      const prodIdStr = String(productId);
      const hasItem = wishlist.includes(prodIdStr);

      if (action === 'add' || (!action && !hasItem)) {
        if (!hasItem) wishlist.push(prodIdStr);
      } else if (action === 'remove' || (!action && hasItem)) {
        wishlist = wishlist.filter(id => id !== prodIdStr);
      }

      storeCustomer.wishlistProductIds = wishlist;
      await CustomerService.saveStoreCustomer(targetStoreId, uid, { wishlistProductIds: wishlist });
      sendJson(res, 200, { ok: true, wishlistProductIds: wishlist, isWishlisted: wishlist.includes(prodIdStr) });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // GET /api/customer/orders (Listado de órdenes del cliente autenticado)
  if (reqPath === '/api/customer/orders' && req.method === 'GET') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const requestedUid = qs.uid || auth.uid;
      const requestedEmail = (qs.email || auth.email || '').toLowerCase().trim();
      if (auth.role !== 'superadmin') {
        if (qs.uid && String(qs.uid) !== String(auth.uid)) {
          sendJson(res, 403, { ok: false, error: 'No tenés permisos para consultar pedidos de otro usuario.' });
          return;
        }
        if (qs.email && auth.email && qs.email.toLowerCase().trim() !== auth.email.toLowerCase().trim()) {
          sendJson(res, 403, { ok: false, error: 'No tenés permisos para consultar pedidos de otro correo.' });
          return;
        }
      }
      const orders = await CustomerService.getUserOrders(requestedUid, requestedEmail);
      sendJson(res, 200, { ok: true, orders });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // POST /api/tryon/record-generation (Guardar en try_on_generations/{genId})
  if (reqPath === '/api/tryon/record-generation' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const data = JSON.parse(raw.toString() || '{}');
      const targetStoreId = data.storeId || currentStore.id || 'principal';

      const auth = await AuthGuard.authenticateRequest(req);
      const verifiedUserId = auth.authenticated ? auth.uid : null;
      let isOwnerTest = false;
      if (auth.authenticated && AuthGuard.canManageStore(auth, targetStoreId)) {
        isOwnerTest = Boolean(data.isOwnerTest !== false);
      }

      const recordRes = await CustomerService.recordTryOnGeneration({
        storeId: targetStoreId,
        userId: verifiedUserId,
        isOwnerTest,
        productId: data.productId || null,
        productSnapshot: data.productSnapshot || null,
        resultImageUrl: data.resultImageUrl
      });

      sendJson(res, 200, recordRes);
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // GET /api/tryon/generations (Historial de generaciones del usuario autenticado)
  if (reqPath === '/api/tryon/generations' && req.method === 'GET') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const uid = qs.uid || auth.uid;
      const storeId = qs.storeId || currentStore.id;
      if (!uid) {
        sendJson(res, 400, { ok: false, error: 'uid requerido' });
        return;
      }
      if (String(auth.uid) !== String(uid) && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'No tenés permisos para consultar generaciones de otro usuario.' });
        return;
      }
      const generations = await CustomerService.getUserTryOns(uid, storeId);
      sendJson(res, 200, { ok: true, generations });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 1.0 GET /api/database/status (Estado de la conexión a Firebase Firestore)
  if (reqPath === '/api/database/status' && req.method === 'GET') {
    const dbInfo = StoreManager.getDatabaseInfo ? StoreManager.getDatabaseInfo() : { provider: 'Firebase Firestore', connected: true };
    sendJson(res, 200, { ok: true, database: dbInfo });
    return;
  }

  // 1.05 GET /api/plans (Listado de planes y suscripciones CapFit)
  if (reqPath === '/api/plans' && req.method === 'GET') {
    const plans = StoreManager.getPlansCatalog ? StoreManager.getPlansCatalog() : [];
    const store = StoreManager.getStoreById(currentStore.id) || currentStore;
    const quota = StoreManager.getAiQuotaStatus(currentStore.id);
    const planId = (store.planId || store.plan || 'free').toLowerCase();
    const planDetails = StoreManager.getPlanDetails ? StoreManager.getPlanDetails(planId) : null;

    sendJson(res, 200, {
      ok: true,
      currentPlanId: planId,
      currentPlanName: (planDetails && planDetails.name) || store.plan || 'FREE',
      storeId: store.id,
      storeName: store.name,
      quota,
      plans
    });
    return;
  }

  // 1.06 POST /api/subscriptions/create-preapproval (Crear débito automático recurrente con Mercado Pago)
  if (reqPath === '/api/subscriptions/create-preapproval' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const storeId = body.storeId || qs.store || currentStore.id;
      if (!AuthGuard.canManageStore(auth, storeId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para gestionar la suscripción de la tienda "${storeId}".` });
        return;
      }
      const host = req.headers.host || '';

      const result = await MercadoPagoSubscriptions.createSubscriptionPreapproval({
        planId: body.planId,
        storeId: storeId,
        payerEmail: body.payerEmail || auth.email,
        backUrl: body.backUrl,
        host: host
      });

      sendJson(res, 200, result);
    } catch (e) {
      console.error('[API Subscriptions Error]', e);
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 1.07 POST /api/webhooks/mercadopago & /api/subscriptions/webhook (Webhook oficial de Mercado Pago)
  if ((reqPath === '/api/webhooks/mercadopago' || reqPath === '/api/subscriptions/webhook') && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const result = await MercadoPagoSubscriptions.processWebhook(body, req.headers, qs);
      sendJson(res, 200, result);
    } catch (e) {
      console.error('[Webhook Error]', e);
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 1.08 GET /api/subscriptions/status (Consultar estado de suscripción)
  if (reqPath === '/api/subscriptions/status' && req.method === 'GET') {
    const targetStoreId = qs.store || qs.storeId || currentStore.id;
    const store = StoreManager.getStoreById(targetStoreId) || currentStore;
    const quota = StoreManager.getAiQuotaStatus(targetStoreId);
    const planDetails = StoreManager.getPlanDetails(store.planId || store.plan);
    const auth = await AuthGuard.authenticateRequest(req);
    const isAuthorizedAdmin = auth.authenticated && AuthGuard.canManageStore(auth, store.id);
    const mpStatus = MercadoPagoSubscriptions.getCredentialsStatus();

    sendJson(res, 200, {
      ok: true,
      storeId: store.id,
      storeName: store.name,
      plan: planDetails,
      subscriptionStatus: store.subscriptionStatus || 'active',
      preapprovalId: isAuthorizedAdmin ? (store.preapprovalId || store.subscriptionId || null) : undefined,
      subscribedAt: store.subscribedAt || null,
      quota,
      mercadoPago: {
        configured: mpStatus.configured,
        isSandbox: mpStatus.isSandbox
      }
    });
    return;
  }

  // 1.09 POST /api/subscriptions/cancel (Cancelar débito automático y volver a plan FREE)
  if (reqPath === '/api/subscriptions/cancel' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const targetStoreId = body.storeId || qs.store || currentStore.id;
      if (!AuthGuard.canManageStore(auth, targetStoreId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para cancelar la suscripción de "${targetStoreId}".` });
        return;
      }
      const result = await MercadoPagoSubscriptions.cancelSubscription(targetStoreId);
      sendJson(res, 200, result);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 1.095 GET /api/subscriptions/config & POST /api/admin/subscriptions/config
  if (reqPath === '/api/subscriptions/config' && req.method === 'GET') {
    const auth = await AuthGuard.authenticateRequest(req);
    if (!auth.authenticated) {
      sendJson(res, 401, { ok: false, error: auth.error });
      return;
    }
    if (auth.role !== 'superadmin') {
      sendJson(res, 403, { ok: false, error: 'Solo el SuperAdmin puede consultar la configuración de credenciales de pasarela.' });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      config: MercadoPagoSubscriptions.getCredentialsStatus()
    });
    return;
  }

  if (reqPath === '/api/admin/subscriptions/config' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      if (auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'Solo el SuperAdmin de la plataforma puede modificar las credenciales de Mercado Pago.' });
        return;
      }
      const raw = await readBody(req);
      const creds = JSON.parse(raw.toString() || '{}');
      const updated = MercadoPagoSubscriptions.setCredentials(creds);
      sendJson(res, 200, { ok: true, message: 'Credenciales de Mercado Pago actualizadas.', status: updated });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 1.0955 POST o GET /api/subscriptions/config/test (Probar conexión con Mercado Pago — Solo SuperAdmin)
  if ((reqPath === '/api/subscriptions/config/test' || reqPath === '/api/admin/subscriptions/test') && (req.method === 'POST' || req.method === 'GET')) {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      if (auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'Solo el SuperAdmin puede probar credenciales de pasarela.' });
        return;
      }
      let customToken = null;
      if (req.method === 'POST') {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw.toString() || '{}');
        if (parsed.token) customToken = parsed.token;
      }
      const testResult = await MercadoPagoSubscriptions.testConnection(customToken);
      sendJson(res, 200, testResult);
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 1.096 POST /api/subscriptions/simulate-approval (Simulación de activación — BLOQUEADA en producción)
  if (reqPath === '/api/subscriptions/simulate-approval' && req.method === 'POST') {
    const isSimulationAllowed =
      process.env.NODE_ENV !== 'production' &&
      !process.env.VERCEL &&
      (process.env.NODE_ENV === 'development' || process.env.ALLOW_SUBSCRIPTION_SIMULATION === 'true');

    if (!isSimulationAllowed) {
      sendJson(res, 403, {
        ok: false,
        error: 'La aprobación simulada de suscripciones está deshabilitada en este entorno. Los planes solo se activan mediante confirmación verificada de pasarela.'
      });
      return;
    }

    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }

      const raw = await readBody(req);
      const { storeId, planId } = JSON.parse(raw.toString() || '{}');
      const targetStore = storeId || currentStore.id;

      if (!AuthGuard.canManageStore(auth, targetStore)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para administrar la tienda "${targetStore}".` });
        return;
      }

      const plan = StoreManager.getPlanDetails(planId);
      if (!plan) throw new Error('Plan no válido');

      const updated = StoreManager.updateStore(targetStore, {
        plan: plan.name,
        planId: plan.id,
        aiMonthlyLimit: plan.generations_per_month,
        subscriptionStatus: 'active',
        subscriptionId: `sim_appr_${Date.now()}`,
        subscribedAt: new Date().toISOString()
      });

      sendJson(res, 200, {
        ok: true,
        message: `Plan "${plan.name}" activado exitosamente en ${updated.name} (Modo desarrollo controlado)`,
        store: updated,
        aiQuota: StoreManager.getAiQuotaStatus(updated.id)
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 1.1 GET /api/admin/stores (Listado SaaS de todas las tiendas con cuotas — Solo SuperAdmin)
  if (reqPath === '/api/admin/stores' && req.method === 'GET') {
    const auth = await AuthGuard.authenticateRequest(req);
    if (!auth.authenticated) {
      sendJson(res, 401, { ok: false, error: auth.error });
      return;
    }
    if (auth.role !== 'superadmin') {
      sendJson(res, 403, { ok: false, error: 'Se requiere rol SuperAdmin para listar todas las tiendas de la plataforma.' });
      return;
    }
    const stores = StoreManager.getAllStores();
    const detailed = stores.map(s => {
      const quota = StoreManager.getAiQuotaStatus(s.id);
      const prods = StoreManager.readStoreProducts(s.id);
      const ords = StoreManager.readStoreOrders(s.id);
      return {
        ...s,
        productsCount: prods.length,
        ordersCount: ords.length,
        aiQuota: quota
      };
    });
    sendJson(res, 200, detailed);
    return;
  }

  // 1.2 POST /api/admin/stores (Crear nueva tienda SaaS con subdominio — Solo SuperAdmin)
  if (reqPath === '/api/admin/stores' && req.method === 'POST') {
    const auth = await AuthGuard.authenticateRequest(req);
    if (!auth.authenticated) {
      sendJson(res, 401, { ok: false, error: auth.error });
      return;
    }
    if (auth.role !== 'superadmin') {
      sendJson(res, 403, { ok: false, error: 'Solo el SuperAdmin puede crear tiendas con configuración personalizada desde esta ruta. Usá el registro de dueño con Firebase Auth.' });
      return;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const newStore = StoreManager.createStore(body);
      sendJson(res, 201, {
        ok: true,
        message: `Tienda "${newStore.name}" creada con éxito en ${newStore.subdomain}.capfit.store`,
        store: newStore,
        aiQuota: StoreManager.getAiQuotaStatus(newStore.id)
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 1.3 PUT /api/admin/stores/:id (Actualizar tienda — Plan/Cuotas restringido exclusivamente a SuperAdmin)
  if (reqPath.startsWith('/api/admin/stores/') && req.method === 'PUT') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }

      const storeTargetId = decodeURIComponent(reqPath.replace('/api/admin/stores/', ''));
      if (!AuthGuard.canManageStore(auth, storeTargetId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para administrar la tienda "${storeTargetId}".` });
        return;
      }

      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');

      // Bloquear escalada financiera: un dueño de tienda no puede modificarse plan, límite mensual ni uso de IA
      const privilegedFields = ['plan', 'planId', 'aiMonthlyLimit', 'aiGenerationsUsed', 'resetAiUsage', 'subscriptionStatus', 'subscriptionId', 'preapprovalId', 'active'];
      const attemptsPrivilegedChange = privilegedFields.some(field => updates[field] !== undefined);
      if (attemptsPrivilegedChange && auth.role !== 'superadmin') {
        sendJson(res, 403, {
          ok: false,
          error: 'Solo el SuperAdmin de la plataforma o la pasarela de pagos verificada pueden modificar el plan o el cupo mensual de IA.'
        });
        return;
      }

      const updated = StoreManager.updateStore(storeTargetId, updates);
      sendJson(res, 200, {
        ok: true,
        message: 'Tienda actualizada',
        store: updated,
        aiQuota: StoreManager.getAiQuotaStatus(updated.id)
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 2. GET /api/products (Público y Backoffice para la tienda actual)
  if (reqPath === '/api/products' && req.method === 'GET') {
    const targetStoreId = qs.store || qs.storeId || currentStore.id;
    const products = StoreManager.readStoreProducts(targetStoreId);
    sendJson(res, 200, products);
    return;
  }

  // 3. POST /api/admin/products (Crear nuevo producto en la tienda actual — Requiere StoreOwner de targetStoreId o SuperAdmin)
  if (reqPath === '/api/admin/products' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }

      const raw = await readBody(req);
      const p = JSON.parse(raw.toString() || '{}');
      const targetStoreId = p.storeId || qs.store || currentStore.id;

      if (!AuthGuard.canManageStore(auth, targetStoreId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para agregar productos en la tienda "${targetStoreId}".` });
        return;
      }

      if (!p.nombre || p.precio === undefined) {
        sendJson(res, 400, { ok: false, error: 'El nombre y precio son obligatorios.' });
        return;
      }
      const products = StoreManager.readStoreProducts(targetStoreId);
      let baseId = (p.id || p.nombre)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!baseId) baseId = 'producto-' + Date.now();

      let finalId = baseId;
      let counter = 1;
      while (products.some(item => item.id === finalId)) {
        finalId = `${baseId}-${counter++}`;
      }

      const isAnteojos = p.tipo === 'anteojos' || p.tipo === 'anteojo';
      const defaultImg = isAnteojos ? 'assets/anteojos/ant_arg.png' : 'assets/gorras/Gorra_negra_frente.webp';
      const defaultDetails = isAnteojos
        ? ['Protección UV400', 'Marco resistente y liviano', 'Cristales polarizados', 'Incluye estuche']
        : ['Algodón premium', 'Ajuste regulable', 'Unisex'];

      const newProduct = {
        id: finalId,
        storeId: targetStoreId,
        tipo: p.tipo || 'gorra',
        categoria: p.categoria || p.tipo || 'gorra',
        nombre: p.nombre.trim(),
        marca: p.marca ? p.marca.trim() : (currentStore.name || 'CAPFIT'),
        coleccion: p.coleccion ? p.coleccion.trim() : 'Urbana',
        precio: Number(p.precio) || 0,
        precioAnterior: p.precioAnterior ? Number(p.precioAnterior) : null,
        badge: p.badge && p.badge.trim() ? p.badge.trim() : null,
        rating: p.rating ? Number(p.rating) : 4.9,
        reviews: p.reviews ? Number(p.reviews) : 1,
        stock: p.stock !== undefined ? Math.max(0, parseInt(p.stock, 10)) : 10,
        colores: Array.isArray(p.colores) && p.colores.length > 0
          ? p.colores
          : [{ name: 'Negro', hex: '#111111' }],
        imgPreview: p.imgPreview || defaultImg,
        imgFrontal: p.imgFrontal || p.imgPreview || defaultImg,
        detalles: Array.isArray(p.detalles) && p.detalles.length > 0
          ? p.detalles
          : defaultDetails
      };

      products.unshift(newProduct);
      StoreManager.writeStoreProducts(targetStoreId, products);
      sendJson(res, 201, { ok: true, product: newProduct, message: 'Producto guardado en la base de datos de la tienda' });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 4.1 POST /api/admin/products/sync (Sincronización forzada con Firestore para la tienda)
  if (reqPath === '/api/admin/products/sync' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      const targetStoreId = qs.store || currentStore.id;
      if (!AuthGuard.canManageStore(auth, targetStoreId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para sincronizar el catálogo de "${targetStoreId}".` });
        return;
      }
      const resSync = await StoreManager.syncStoreProductsToFirestore(targetStoreId);
      sendJson(res, 200, { ok: true, ...resSync, message: `Catálogo de "${targetStoreId}" sincronizado en Firestore` });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 4. PUT /api/admin/products/:id (Modificar precio, stock, detalles en la tienda)
  if (reqPath.startsWith('/api/admin/products/') && req.method === 'PUT') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }

      const targetId = decodeURIComponent(reqPath.replace('/api/admin/products/', ''));
      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');
      const targetStoreId = updates.storeId || qs.store || currentStore.id;

      if (!AuthGuard.canManageStore(auth, targetStoreId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para modificar productos de la tienda "${targetStoreId}".` });
        return;
      }

      const products = StoreManager.readStoreProducts(targetStoreId);
      const idx = products.findIndex(p => p.id === targetId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: 'Producto no encontrado en esta tienda' });
        return;
      }

      const p = products[idx];
      p.storeId = targetStoreId;
      if (updates.nombre !== undefined) p.nombre = updates.nombre.trim();
      if (updates.marca !== undefined) p.marca = updates.marca.trim();
      if (updates.coleccion !== undefined) p.coleccion = updates.coleccion.trim();
      if (updates.tipo !== undefined) {
        p.tipo = updates.tipo;
        p.categoria = updates.tipo;
      }
      if (updates.precio !== undefined) p.precio = Number(updates.precio);
      if (updates.precioAnterior !== undefined) {
        p.precioAnterior = updates.precioAnterior ? Number(updates.precioAnterior) : null;
      }
      if (updates.stock !== undefined) p.stock = Math.max(0, parseInt(updates.stock, 10));
      if (updates.badge !== undefined) p.badge = updates.badge && updates.badge.trim() ? updates.badge.trim() : null;
      if (updates.colores !== undefined && Array.isArray(updates.colores)) p.colores = updates.colores;
      if (updates.imgPreview !== undefined) p.imgPreview = updates.imgPreview;
      if (updates.imgFrontal !== undefined) p.imgFrontal = updates.imgFrontal;
      if (updates.detalles !== undefined && Array.isArray(updates.detalles)) p.detalles = updates.detalles;

      products[idx] = p;
      StoreManager.writeStoreProducts(targetStoreId, products);
      sendJson(res, 200, { ok: true, product: p, message: 'Producto actualizado en la base de datos de la tienda' });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 5. DELETE /api/admin/products/:id (Eliminar producto de la tienda y de Firestore)
  if (reqPath.startsWith('/api/admin/products/') && req.method === 'DELETE') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }

      const targetId = decodeURIComponent(reqPath.replace('/api/admin/products/', ''));
      const targetStoreId = qs.store || currentStore.id;
      if (!AuthGuard.canManageStore(auth, targetStoreId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para eliminar productos de la tienda "${targetStoreId}".` });
        return;
      }

      const ok = StoreManager.deleteStoreProduct(targetStoreId, targetId);
      if (!ok) {
        sendJson(res, 404, { ok: false, error: 'Producto no encontrado' });
        return;
      }
      sendJson(res, 200, { ok: true, message: 'Producto eliminado con éxito de la base de datos de la tienda' });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 6. POST /api/admin/upload (Subida de fotos de productos convertidas a WebP — Requiere Admin autenticado)
  if (reqPath === '/api/admin/upload' && req.method === 'POST') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }
      if (auth.role !== 'superadmin' && auth.role !== 'store_owner') {
        sendJson(res, 403, { ok: false, error: 'Se requieren permisos de administrador de tienda para subir imágenes de catálogo.' });
        return;
      }

      const raw = await readBody(req);
      const { filename, base64, storeId } = JSON.parse(raw.toString() || '{}');
      const targetStoreId = storeId || qs.store || auth.storeId || currentStore.id;
      if (auth.role !== 'superadmin' && !AuthGuard.canManageStore(auth, targetStoreId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para subir archivos en la tienda "${targetStoreId}".` });
        return;
      }

      if (!base64) {
        sendJson(res, 400, { ok: false, error: 'No se envió la imagen base64' });
        return;
      }
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      // Asegurar extensión .webp para optimización y compatibilidad
      const origExt = path.extname(filename || '');
      const safeBase = path.basename(filename || 'gorra', origExt).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFilename = `${safeBase}_${Date.now()}.webp`;

      const uploadDir = path.join(__dirname, 'assets', 'gorras');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, safeFilename), buffer);

      sendJson(res, 200, {
        ok: true,
        url: `assets/gorras/${safeFilename}`
      });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 7. GET /api/orders (Listado de pedidos de la tienda — Protegido: Solo dueño de la tienda o SuperAdmin)
  if (reqPath === '/api/orders' && req.method === 'GET') {
    const auth = await AuthGuard.authenticateRequest(req);
    if (!auth.authenticated) {
      sendJson(res, 401, { ok: false, error: auth.error });
      return;
    }
    const targetStoreId = qs.store || currentStore.id;
    if (!AuthGuard.canManageStore(auth, targetStoreId)) {
      sendJson(res, 403, { ok: false, error: `No tenés permisos para consultar los pedidos de la tienda "${targetStoreId}".` });
      return;
    }
    const orders = StoreManager.readStoreOrders(targetStoreId);
    sendJson(res, 200, orders);
    return;
  }

  // 8. POST /api/orders (Nuevo pedido desde checkout — Fuerza paymentStatus: 'Pendiente' y recalcula precios reales)
  if (reqPath === '/api/orders' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const orderData = JSON.parse(raw.toString() || '{}');
      const targetStoreId = orderData.storeId || qs.store || currentStore.id;
      const storeObj = StoreManager.getStoreById(targetStoreId);
      if (!storeObj) {
        sendJson(res, 404, { ok: false, error: 'Tienda no encontrada' });
        return;
      }

      const orders = StoreManager.readStoreOrders(storeObj.id);
      const products = StoreManager.readStoreProducts(storeObj.id);

      const rawItems = Array.isArray(orderData.items) ? orderData.items : [];
      if (rawItems.length === 0) {
        sendJson(res, 400, { ok: false, error: 'El pedido debe incluir al menos un producto.' });
        return;
      }

      // Verificar si hay un usuario autenticado para vincular userId de forma segura
      const auth = await AuthGuard.authenticateRequest(req);
      let verifiedUserId = null;
      if (auth.authenticated && auth.uid) {
        if (!orderData.userId || String(orderData.userId) === String(auth.uid) || auth.role === 'superadmin') {
          verifiedUserId = orderData.userId ? String(orderData.userId) : String(auth.uid);
        }
      }

      // Recalcular precios unitarios y subtotal desde el catálogo oficial de la tienda
      let calculatedSubtotal = 0;
      const sanitizedItems = rawItems.map(item => {
        const targetId = item.id || (item.product && item.product.id);
        const catalogProd = products.find(p => p.id === targetId);
        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        const officialPrice = catalogProd ? Number(catalogProd.precio) : Math.max(0, Number(item.precio) || 0);
        calculatedSubtotal += officialPrice * qty;

        return {
          id: targetId || `item_${Date.now()}`,
          nombre: catalogProd ? catalogProd.nombre : String(item.nombre || 'Producto CAPFIT'),
          color: item.color || 'Único',
          colorHex: item.colorHex || '#111111',
          quantity: qty,
          precio: officialPrice,
          imgPreview: catalogProd ? catalogProd.imgPreview : (item.imgPreview || 'assets/gorras/Gorra_negra_frente.webp')
        };
      });

      const storeSections = StoreManager.getStoreSections(storeObj.id);
      const freeShippingThreshold = (storeSections && storeSections.envios && Number(storeSections.envios.freeShippingThreshold)) || 40000;
      const officialShipping = calculatedSubtotal >= freeShippingThreshold ? 0 : (orderData.shipping !== undefined ? Math.max(0, Number(orderData.shipping)) : 3500);
      const calculatedTotal = calculatedSubtotal + officialShipping;

      const orderId = orderData.id || ('#MP-' + Math.floor(100000 + Math.random() * 900000));
      const buyerEmail = (orderData.buyerEmail || (orderData.customer && orderData.customer.email) || (auth.authenticated && auth.email) || '').toLowerCase().trim();
      const isClaimed = Boolean(verifiedUserId);

      // Decisión de seguridad confirmada: Toda orden creada desde checkout público nace como 'Pendiente'
      const newOrder = {
        id: orderId,
        storeId: storeObj.id,
        userId: verifiedUserId,
        buyerEmail: buyerEmail,
        isClaimed: isClaimed,
        date: new Date().toISOString(),
        customer: orderData.customer || {
          name: 'Comprador ' + (storeObj.name || 'CAPFIT'),
          email: buyerEmail || 'cliente@ejemplo.com',
          phone: '+54 9 11 0000-0000',
          address: 'Av. Corrientes 1234',
          city: 'CABA',
          postalCode: '1000'
        },
        items: sanitizedItems,
        subtotal: calculatedSubtotal,
        shipping: officialShipping,
        total: calculatedTotal,
        totalAmount: calculatedTotal,
        paymentMethod: orderData.paymentMethod || 'Tarjeta de Crédito Mercado Pago',
        paymentStatus: 'Pendiente',
        shippingStatus: 'Por preparar',
        shippingTracking: {
          carrier: (orderData.shippingTracking && orderData.shippingTracking.carrier) || orderData.carrier || 'Andreani',
          trackingCode: '',
          shippedAt: null
        },
        trackingCode: '',
        notes: orderData.notes ? String(orderData.notes).slice(0, 500) : '',
        status: 'pending'
      };

      // Descontar stock automáticamente de los productos del pedido en la tienda
      sanitizedItems.forEach(item => {
        const prod = products.find(p => p.id === item.id);
        if (prod && prod.stock !== undefined) {
          prod.stock = Math.max(0, prod.stock - item.quantity);
        }
      });
      StoreManager.writeStoreProducts(storeObj.id, products);

      orders.unshift(newOrder);
      StoreManager.writeStoreOrders(storeObj.id, orders);
      if (CustomerService && typeof CustomerService.recordOrder === 'function') {
        CustomerService.recordOrder(newOrder);
      }

      // Persistir orden en Firebase Firestore
      if (FirebaseDb && typeof FirebaseDb.saveOrder === 'function') {
        FirebaseDb.saveOrder(newOrder).catch(err => console.warn('[orders] Firestore save warning:', err.message));
      }

      // Actualizar estadísticas del cliente en store_customers
      if (verifiedUserId && CustomerService) {
        (async () => {
          try {
            const rel = await CustomerService.getStoreCustomer(storeObj.id, verifiedUserId);
            const stats = (rel && rel.stats) ? rel.stats : { totalOrders: 0, totalSpent: 0, tryOnsCount: 0 };
            stats.totalOrders = (stats.totalOrders || 0) + 1;
            stats.totalSpent = (stats.totalSpent || 0) + (newOrder.total || 0);
            stats.lastOrderAt = new Date().toISOString();
            await CustomerService.saveStoreCustomer(storeObj.id, verifiedUserId, { stats });
          } catch (_) {}
        })();
      }

      sendJson(res, 201, { ok: true, order: newOrder });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 9. PUT /api/orders/:id (Actualizar estado de pago, despacho o tracking — Protegido: Solo dueño de la tienda o SuperAdmin)
  if (reqPath.startsWith('/api/orders/') && req.method === 'PUT') {
    try {
      const auth = await AuthGuard.authenticateRequest(req);
      if (!auth.authenticated) {
        sendJson(res, 401, { ok: false, error: auth.error });
        return;
      }

      const orderId = decodeURIComponent(reqPath.replace('/api/orders/', ''));
      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');
      const targetStoreId = updates.storeId || qs.store || currentStore.id;

      if (!AuthGuard.canManageStore(auth, targetStoreId)) {
        sendJson(res, 403, { ok: false, error: `No tenés permisos para modificar pedidos de la tienda "${targetStoreId}".` });
        return;
      }

      const orders = StoreManager.readStoreOrders(targetStoreId);
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: 'Pedido no encontrado en esta tienda' });
        return;
      }

      const order = orders[idx];
      if (order.storeId && String(order.storeId).toLowerCase() !== String(targetStoreId).toLowerCase() && auth.role !== 'superadmin') {
        sendJson(res, 403, { ok: false, error: 'El pedido pertenece a otra tienda.' });
        return;
      }

      if (updates.paymentStatus !== undefined) order.paymentStatus = updates.paymentStatus;
      if (updates.shippingStatus !== undefined) order.shippingStatus = updates.shippingStatus;
      if (updates.status !== undefined) order.status = updates.status;
      if (updates.trackingCode !== undefined) {
        order.trackingCode = updates.trackingCode.trim();
        if (!order.shippingTracking) order.shippingTracking = { carrier: 'Andreani', trackingCode: '', shippedAt: null };
        order.shippingTracking.trackingCode = updates.trackingCode.trim();
        if (updates.shippingStatus === 'Despachado' || updates.shippingStatus === 'En camino') {
          order.shippingTracking.shippedAt = new Date().toISOString();
        }
      }
      if (updates.shippingTracking !== undefined) {
        order.shippingTracking = updates.shippingTracking;
      }
      if (updates.notes !== undefined) order.notes = updates.notes;

      orders[idx] = order;
      StoreManager.writeStoreOrders(targetStoreId, orders);

      if (FirebaseDb && typeof FirebaseDb.updateOrder === 'function') {
        FirebaseDb.updateOrder(orderId, order).catch(() => {});
      }

      sendJson(res, 200, { ok: true, order });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // ── Archivos estáticos: Separación Landing Comercial (capfit.store) vs App (app.capfit.store) ──
  if (reqPath === '/favicon.ico') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // Identificar si la solicitud corresponde a la landing comercial (capfit.store, www.capfit.store o ruta /landing)
  const isLandingRequest = hostHdr === 'capfit.store' || hostHdr === 'www.capfit.store' || reqPath === '/landing' || reqPath.startsWith('/landing/');

  if (isLandingRequest) {
    let landingSubPath = reqPath;
    if (landingSubPath.startsWith('/landing')) {
      landingSubPath = landingSubPath.slice('/landing'.length);
    }
    if (landingSubPath === '' || landingSubPath === '/') {
      landingSubPath = '/index.html';
    }

    const landingDir = path.join(__dirname, 'landing');
    const landingFilePath = path.join(landingDir, landingSubPath);
    if (!landingFilePath.startsWith(landingDir)) { res.writeHead(403); res.end('Forbidden'); return; }

    fs.readFile(landingFilePath, (err, data) => {
      if (err) {
        const ext = path.extname(landingSubPath);
        if (!ext) {
          const tryHtml = landingFilePath + '.html';
          if (fs.existsSync(tryHtml)) {
            const htmlData = fs.readFileSync(tryHtml);
            res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlData);
            return;
          }
          fs.readFile(path.join(landingDir, 'index.html'), (errLandingIndex, landingIndexData) => {
            if (!errLandingIndex) {
              res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'text/html; charset=utf-8' });
              res.end(landingIndexData);
              return;
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404: ' + reqPath);
          });
          return;
        }

        // Si es un asset que no está en landing/, fallback a la raíz
        const fallbackRootPath = path.join(__dirname, landingSubPath);
        if (fallbackRootPath.startsWith(__dirname) && fs.existsSync(fallbackRootPath) && !fs.statSync(fallbackRootPath).isDirectory()) {
          const fallbackData = fs.readFileSync(fallbackRootPath);
          const mime = MIME[path.extname(fallbackRootPath)] || 'application/octet-stream';
          res.writeHead(200, { ...corsHeaders(), 'Content-Type': mime });
          res.end(fallbackData);
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404: ' + reqPath);
        return;
      }
      const mime = MIME[path.extname(landingFilePath)] || 'application/octet-stream';
      res.writeHead(200, { ...corsHeaders(), 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  // ── Aplicación actual (app.capfit.store, dominios de tiendas y subdominios) ──
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