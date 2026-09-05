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
StoreManager.initDefaultStores();

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
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

const GORRAS_FILE = path.join(__dirname, 'assets', 'gorras.json');
const ORDERS_FILE = path.join(__dirname, 'assets', 'orders.json');

function readJsonFile(filePath, defaultVal = []) {
  try {
    if (!fs.existsSync(filePath)) return defaultVal;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Error leyendo ' + filePath, e.message);
    return defaultVal;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error escribiendo ' + filePath, e.message);
    return false;
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data));
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

async function appHandler(req, res) {
  const parsed  = url.parse(req.url, true);
  const reqPath = parsed.pathname;
  const qs      = parsed.query;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders()); res.end(); return;
  }

  // Resolver la tienda actual según host, subdominio o parámetro (?store=tienda1)
  const currentStore = StoreManager.resolveStoreFromRequest(req);

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

    // ===== CONTROL DE CUOTA MENSUAL DE IA POR TIENDA =====
    const quotaCheck = StoreManager.checkAndDeductAiCredit(currentStore.id);
    if (!quotaCheck.ok) {
      console.warn(`[AI CUOTA EXCEDIDA] Tienda "${currentStore.name}":`, quotaCheck.message);
      res.writeHead(429, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' });
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
    console.log(`[AI CUOTA] 1 crédito descontado para "${currentStore.name}". Usados este mes: ${quotaCheck.used}/${quotaCheck.limit} (Restantes: ${quotaCheck.remaining})`);
    
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
  if (reqPath === '/api/fal/submit') {
    const falKey = process.env.FAL_KEY || '';
    const model = qs.model || 'fal-ai/fashn/tryon/v1.5';

    // ===== CONTROL DE CUOTA MENSUAL DE IA POR TIENDA =====
    const quotaCheck = StoreManager.checkAndDeductAiCredit(currentStore.id);
    if (!quotaCheck.ok) {
      console.warn(`[AI CUOTA EXCEDIDA] Tienda "${currentStore.name}":`, quotaCheck.message);
      res.writeHead(429, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' });
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
    console.log(`[AI CUOTA] 1 crédito descontado para "${currentStore.name}". Usados este mes: ${quotaCheck.used}/${quotaCheck.limit} (Restantes: ${quotaCheck.remaining})`);

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

  // ── BACKOFFICE & STORE API ROUTES ──────────────────────────

  // 0. GET /api/store/current (Información de la tienda activa y su cuota mensual de IA)
  if (reqPath === '/api/store/current' && req.method === 'GET') {
    const quota = StoreManager.getAiQuotaStatus(currentStore.id);
    sendJson(res, 200, {
      ok: true,
      store: {
        id: currentStore.id,
        subdomain: currentStore.subdomain,
        fullDomain: currentStore.fullDomain || `${currentStore.subdomain}.capfit.shop`,
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
      fullDomain: s.fullDomain || `${s.subdomain}.capfit.shop`,
      name: s.name,
      tagline: s.tagline,
      plan: s.plan,
      aiQuota: StoreManager.getAiQuotaStatus(s.id),
      active: s.active
    }));
    sendJson(res, 200, publicList);
    return;
  }

  // 1. POST /api/admin/login (Login SuperAdmin o Dueño de Tienda)
  if (reqPath === '/api/admin/login' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { username, password, storeId } = JSON.parse(raw.toString() || '{}');
      const expectedSuperPassword = process.env.ADMIN_PASSWORD || 'capfit2026';
      const cleanPass = (password || '').trim();
      const cleanUser = (username || '').trim();

      // A) Login como SuperAdmin de la plataforma CAPFIT
      if (cleanPass === expectedSuperPassword && (!cleanUser || cleanUser.toLowerCase() === 'admin' || cleanUser.toLowerCase() === 'superadmin')) {
        sendJson(res, 200, {
          ok: true,
          role: 'superadmin',
          storeId: storeId || currentStore.id || 'principal',
          token: 'capfit_superadmin_' + Date.now(),
          message: 'Autenticación exitosa como Administrador de la Plataforma CAPFIT'
        });
        return;
      }

      // B) Login como Dueño de una Tienda específica
      const allStores = StoreManager.getAllStores();
      let matchedStore = null;

      if (cleanUser) {
        matchedStore = allStores.find(s => s.username.toLowerCase() === cleanUser.toLowerCase() && s.password === cleanPass);
      }
      // O si seleccionó la tienda y puso la clave de esa tienda
      if (!matchedStore && storeId) {
        const target = StoreManager.getStoreById(storeId);
        if (target && target.password === cleanPass) {
          matchedStore = target;
        }
      }
      // O si ingresó en el subdominio de su tienda y puso la clave de su tienda
      if (!matchedStore && currentStore && currentStore.password === cleanPass) {
        matchedStore = currentStore;
      }

      if (matchedStore) {
        sendJson(res, 200, {
          ok: true,
          role: 'store_owner',
          storeId: matchedStore.id,
          subdomain: matchedStore.subdomain,
          storeName: matchedStore.name,
          plan: matchedStore.plan,
          token: `capfit_store_${matchedStore.id}_` + Date.now(),
          message: `Bienvenido al panel de ${matchedStore.name}`
        });
        return;
      }

      sendJson(res, 401, {
        ok: false,
        error: 'Credenciales inválidas. Comprobá el usuario y contraseña de tu tienda o utilizá la clave de SuperAdmin.'
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'Datos de login inválidos: ' + e.message });
    }
    return;
  }

  // 1.0 GET /api/database/status (Estado de la conexión a Firebase Firestore)
  if (reqPath === '/api/database/status' && req.method === 'GET') {
    const dbInfo = StoreManager.getDatabaseInfo ? StoreManager.getDatabaseInfo() : { provider: 'Firebase Firestore', connected: true };
    sendJson(res, 200, { ok: true, database: dbInfo });
    return;
  }

  // 1.1 GET /api/admin/stores (Listado SaaS de todas las tiendas con cuotas)
  if (reqPath === '/api/admin/stores' && req.method === 'GET') {
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

  // 1.2 POST /api/admin/stores (Crear nueva tienda SaaS con subdominio)
  if (reqPath === '/api/admin/stores' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const newStore = StoreManager.createStore(body);
      sendJson(res, 201, {
        ok: true,
        message: `Tienda "${newStore.name}" creada con éxito en ${newStore.subdomain}.capfit.shop`,
        store: newStore,
        aiQuota: StoreManager.getAiQuotaStatus(newStore.id)
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }

  // 1.3 PUT /api/admin/stores/:id (Actualizar plan, cuota mensual de IA, etc.)
  if (reqPath.startsWith('/api/admin/stores/') && req.method === 'PUT') {
    try {
      const storeTargetId = decodeURIComponent(reqPath.replace('/api/admin/stores/', ''));
      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');
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
    const targetStoreId = qs.store || currentStore.id;
    const products = StoreManager.readStoreProducts(targetStoreId);
    sendJson(res, 200, products);
    return;
  }

  // 3. POST /api/admin/products (Crear nuevo producto en la tienda actual)
  if (reqPath === '/api/admin/products' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const p = JSON.parse(raw.toString() || '{}');
      const targetStoreId = p.storeId || qs.store || currentStore.id;
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

      const newProduct = {
        id: finalId,
        tipo: p.tipo || 'gorra',
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
        imgPreview: p.imgPreview || 'assets/gorras/Gorra_negra_frente.webp',
        imgFrontal: p.imgFrontal || p.imgPreview || 'assets/gorras/Gorra_negra_frente.webp',
        model3D: p.model3D || 'assets/hat.glb',
        detalles: Array.isArray(p.detalles) && p.detalles.length > 0
          ? p.detalles
          : ['Algodón premium', 'Ajuste regulable', 'Unisex']
      };

      products.unshift(newProduct);
      StoreManager.writeStoreProducts(targetStoreId, products);
      sendJson(res, 201, { ok: true, product: newProduct });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 4. PUT /api/admin/products/:id (Modificar precio, stock, detalles en la tienda)
  if (reqPath.startsWith('/api/admin/products/') && req.method === 'PUT') {
    try {
      const targetId = decodeURIComponent(reqPath.replace('/api/admin/products/', ''));
      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');
      const targetStoreId = updates.storeId || qs.store || currentStore.id;
      const products = StoreManager.readStoreProducts(targetStoreId);
      const idx = products.findIndex(p => p.id === targetId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: 'Producto no encontrado en esta tienda' });
        return;
      }

      const p = products[idx];
      if (updates.nombre !== undefined) p.nombre = updates.nombre.trim();
      if (updates.marca !== undefined) p.marca = updates.marca.trim();
      if (updates.coleccion !== undefined) p.coleccion = updates.coleccion.trim();
      if (updates.tipo !== undefined) p.tipo = updates.tipo;
      if (updates.precio !== undefined) p.precio = Number(updates.precio);
      if (updates.precioAnterior !== undefined) {
        p.precioAnterior = updates.precioAnterior ? Number(updates.precioAnterior) : null;
      }
      if (updates.stock !== undefined) p.stock = Math.max(0, parseInt(updates.stock, 10));
      if (updates.badge !== undefined) p.badge = updates.badge && updates.badge.trim() ? updates.badge.trim() : null;
      if (updates.colores !== undefined && Array.isArray(updates.colores)) p.colores = updates.colores;
      if (updates.imgPreview !== undefined) p.imgPreview = updates.imgPreview;
      if (updates.imgFrontal !== undefined) p.imgFrontal = updates.imgFrontal;
      if (updates.model3D !== undefined) p.model3D = updates.model3D;
      if (updates.detalles !== undefined && Array.isArray(updates.detalles)) p.detalles = updates.detalles;

      products[idx] = p;
      StoreManager.writeStoreProducts(targetStoreId, products);
      sendJson(res, 200, { ok: true, product: p });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 5. DELETE /api/admin/products/:id (Eliminar producto de la tienda)
  if (reqPath.startsWith('/api/admin/products/') && req.method === 'DELETE') {
    try {
      const targetId = decodeURIComponent(reqPath.replace('/api/admin/products/', ''));
      const targetStoreId = qs.store || currentStore.id;
      let products = StoreManager.readStoreProducts(targetStoreId);
      const initialCount = products.length;
      products = products.filter(p => p.id !== targetId);
      if (products.length === initialCount) {
        sendJson(res, 404, { ok: false, error: 'Producto no encontrado' });
        return;
      }
      StoreManager.writeStoreProducts(targetStoreId, products);
      sendJson(res, 200, { ok: true, message: 'Producto eliminado con éxito' });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 6. POST /api/admin/upload (Subida de fotos de productos)
  if (reqPath === '/api/admin/upload' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { filename, base64 } = JSON.parse(raw.toString() || '{}');
      if (!base64) {
        sendJson(res, 400, { ok: false, error: 'No se envió la imagen base64' });
        return;
      }
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      const ext = path.extname(filename || '') || '.webp';
      const safeBase = path.basename(filename || 'gorra', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFilename = `${safeBase}_${Date.now()}${ext}`;

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

  // 7. GET /api/orders (Listado de pedidos de la tienda)
  if (reqPath === '/api/orders' && req.method === 'GET') {
    const targetStoreId = qs.store || currentStore.id;
    const orders = StoreManager.readStoreOrders(targetStoreId);
    sendJson(res, 200, orders);
    return;
  }

  // 8. POST /api/orders (Nuevo pedido desde checkout y descuento de stock en la tienda)
  if (reqPath === '/api/orders' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const orderData = JSON.parse(raw.toString() || '{}');
      const targetStoreId = orderData.storeId || qs.store || currentStore.id;
      const orders = StoreManager.readStoreOrders(targetStoreId);
      const products = StoreManager.readStoreProducts(targetStoreId);

      const orderId = orderData.id || ('#MP-' + Math.floor(100000 + Math.random() * 900000));
      const newOrder = {
        id: orderId,
        storeId: targetStoreId,
        date: orderData.date || new Date().toISOString(),
        customer: orderData.customer || {
          name: 'Comprador ' + (currentStore.name || 'CAPFIT'),
          email: 'cliente@ejemplo.com',
          phone: '+54 9 11 0000-0000',
          address: 'Av. Corrientes 1234',
          city: 'CABA',
          postalCode: '1000'
        },
        items: Array.isArray(orderData.items) ? orderData.items : [],
        subtotal: Number(orderData.subtotal) || 0,
        shipping: Number(orderData.shipping) || 0,
        total: Number(orderData.total) || 0,
        paymentMethod: orderData.paymentMethod || 'Tarjeta de Crédito Mercado Pago',
        paymentStatus: orderData.paymentStatus || 'Aprobado',
        shippingStatus: orderData.shippingStatus || 'Por preparar',
        trackingCode: orderData.trackingCode || '',
        notes: orderData.notes || ''
      };

      // Descontar stock automáticamente de los productos del pedido en la tienda
      if (Array.isArray(newOrder.items)) {
        newOrder.items.forEach(item => {
          const targetId = item.id || (item.product && item.product.id);
          const prod = products.find(p => p.id === targetId);
          if (prod && prod.stock !== undefined) {
            const qty = parseInt(item.quantity, 10) || 1;
            prod.stock = Math.max(0, prod.stock - qty);
          }
        });
        StoreManager.writeStoreProducts(targetStoreId, products);
      }

      orders.unshift(newOrder);
      StoreManager.writeStoreOrders(targetStoreId, orders);
      sendJson(res, 201, { ok: true, order: newOrder });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 9. PUT /api/orders/:id (Actualizar estado de pago, despacho o tracking en la tienda)
  if (reqPath.startsWith('/api/orders/') && req.method === 'PUT') {
    try {
      const orderId = decodeURIComponent(reqPath.replace('/api/orders/', ''));
      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');
      const targetStoreId = updates.storeId || qs.store || currentStore.id;
      const orders = StoreManager.readStoreOrders(targetStoreId);
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx === -1) {
        sendJson(res, 404, { ok: false, error: 'Pedido no encontrado' });
        return;
      }

      const order = orders[idx];
      if (updates.paymentStatus !== undefined) order.paymentStatus = updates.paymentStatus;
      if (updates.shippingStatus !== undefined) order.shippingStatus = updates.shippingStatus;
      if (updates.trackingCode !== undefined) order.trackingCode = updates.trackingCode.trim();
      if (updates.notes !== undefined) order.notes = updates.notes;

      orders[idx] = order;
      StoreManager.writeStoreOrders(targetStoreId, orders);
      sendJson(res, 200, { ok: true, order });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // ── Archivos estáticos ───────────────────────────────────
  let filePath = path.join(__dirname, reqPath === '/' ? 'index.html' : reqPath);
  if (!filePath.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Si la ruta no tiene extensión (o es /404 o /admin), servimos index.html para que el router de la app muestre la vista
      const ext = path.extname(reqPath);
      if (!ext || reqPath === '/404' || reqPath === '/admin') {
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