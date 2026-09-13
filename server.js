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

  // Asegurar que la base de datos Firestore esté sincronizada antes de resolver tienda
  await StoreManager.ensureInitialized();

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

  // 1. POST /api/admin/login (Login SuperAdmin o Dueño de Tienda tradicional / compatibilidad)
  if (reqPath === '/api/admin/login' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { username, password, storeId } = JSON.parse(raw.toString() || '{}');
      const expectedSuperPassword = process.env.ADMIN_PASSWORD || 'capfit2026';
      const cleanPass = (password || '').trim();
      const cleanUser = (username || '').trim();
      const cleanStoreId = (storeId && typeof storeId === 'string' && !storeId.startsWith('ais-')) ? storeId.trim() : '';

      if (!cleanPass) {
        sendJson(res, 400, { ok: false, error: 'Por favor, ingresá la contraseña.' });
        return;
      }

      const allStores = StoreManager.getAllStores();

      // Función auxiliar para validar si la contraseña coincide con una tienda
      function isPasswordValidForStore(st, pass) {
        if (!st || !pass) return false;
        if (st.password && st.password === pass) return true;
        if (st.adminPassword && st.adminPassword === pass) return true;
        if (pass === '123456') return true; // Contraseña demo para tiendas activas
        if (pass === expectedSuperPassword) return true; // Clave maestra plataforma
        if (st.id === 'tienda1' && pass === 'tienda1pass') return true;
        if (st.id === 'tienda2' && pass === 'tienda2pass') return true;
        return false;
      }

      // Función auxiliar para saber si un identificador coincide con una tienda
      function matchesStoreIdentifier(st, ident) {
        if (!st || !ident) return false;
        const low = ident.toLowerCase();
        if (st.id && st.id.toLowerCase() === low) return true;
        if (st.subdomain && st.subdomain.toLowerCase() === low) return true;
        if (st.username && st.username.toLowerCase() === low) return true;
        if (st.ownerEmail && st.ownerEmail.toLowerCase() === low) return true;
        if (st.name && st.name.toLowerCase() === low) return true;
        if (st.id && `admin_${st.id.toLowerCase()}` === low) return true;
        if (st.subdomain && `admin_${st.subdomain.toLowerCase()}` === low) return true;
        if (low.startsWith('admin_') && low.replace('admin_', '') === st.id.toLowerCase()) return true;
        return false;
      }

      let matchedStore = null;

      // 1. Intentar hacer match por el usuario/email ingresado
      if (cleanUser) {
        matchedStore = allStores.find(s => matchesStoreIdentifier(s, cleanUser) && isPasswordValidForStore(s, cleanPass));
        // Si la contraseña no coincidió con la local de la tienda pero sí coincide con la clave maestra de superadmin
        if (!matchedStore && cleanPass === expectedSuperPassword) {
          matchedStore = allStores.find(s => matchesStoreIdentifier(s, cleanUser));
        }
      }

      // 2. Si se especificó storeId explícito o tienda activa en la solicitud
      if (!matchedStore && cleanStoreId) {
        const target = StoreManager.getStoreById(cleanStoreId) || StoreManager.getStoreBySubdomain(cleanStoreId);
        if (target && isPasswordValidForStore(target, cleanPass)) {
          matchedStore = target;
        }
      }

      // 3. Si la solicitud proviene de un subdominio específico
      if (!matchedStore && currentStore && currentStore.id !== 'principal' && isPasswordValidForStore(currentStore, cleanPass)) {
        matchedStore = currentStore;
      }

      // 4. Si es login directo de SuperAdmin con clave maestra de plataforma
      const isSuperAdminUser = !cleanUser || cleanUser.toLowerCase() === 'admin' || cleanUser.toLowerCase() === 'superadmin' || cleanUser.toLowerCase() === 'admin@capfit.shop' || cleanUser.toLowerCase() === (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com').toLowerCase();

      if (cleanPass === expectedSuperPassword && (isSuperAdminUser || !matchedStore)) {
        const targetStore = matchedStore || (cleanStoreId ? StoreManager.getStoreById(cleanStoreId) : null) || (currentStore && currentStore.id !== 'principal' ? currentStore : null) || StoreManager.getStoreById('principal') || allStores[0];
        sendJson(res, 200, {
          ok: true,
          role: 'superadmin',
          storeId: targetStore ? targetStore.id : 'principal',
          subdomain: targetStore ? targetStore.subdomain : 'capfit',
          storeName: targetStore ? targetStore.name : 'CAPFIT Platform Admin',
          token: 'capfit_superadmin_' + Date.now(),
          message: `Autenticación exitosa como Administrador de la Plataforma (${targetStore ? targetStore.name : 'CAPFIT'})`
        });
        return;
      }

      // 5. Si coincidió con una tienda de cliente (Store Owner)
      if (matchedStore) {
        sendJson(res, 200, {
          ok: true,
          role: 'store_owner',
          storeId: matchedStore.id,
          subdomain: matchedStore.subdomain,
          storeName: matchedStore.name,
          plan: matchedStore.plan || 'Starter',
          token: `capfit_store_${matchedStore.id}_` + Date.now(),
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

  // 1.05 POST /api/admin/auth/firebase-verify (Verificación Firebase Auth con Custom Claims y Documento Firestore)
  if (reqPath === '/api/admin/auth/firebase-verify' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const {
        uid,
        email,
        displayName,
        photoURL,
        customClaims = {},
        firestoreUserData = null,
        targetStoreId = null
      } = JSON.parse(raw.toString() || '{}');

      if (!uid || !email) {
        sendJson(res, 400, { ok: false, error: 'Datos de Firebase Auth incompletos (uid y email requeridos).' });
        return;
      }

      const cleanEmail = email.toLowerCase().trim();
      const superadminEmail = (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com').toLowerCase().trim();
      const cleanTargetStoreId = (targetStoreId && typeof targetStoreId === 'string' && !targetStoreId.startsWith('ais-')) ? targetStoreId.trim() : null;

      // 1. Consultar documento del usuario en Firestore si no vino en el body
      let ownerDoc = firestoreUserData;
      if (!ownerDoc && FirebaseDb && typeof FirebaseDb.getStoreOwner === 'function') {
        try {
          ownerDoc = await FirebaseDb.getStoreOwner(uid);
        } catch (dbErr) {
          console.warn('[firebase-verify] No se pudo leer store_owners doc:', dbErr.message);
        }
      }

      // 2. Extraer storeId y rol validados desde Custom Claims o Documento de Firestore
      const claimStoreId = customClaims.storeId || customClaims.store_id || null;
      const claimRole = customClaims.role || (customClaims.admin ? 'superadmin' : null);

      const docStoreId = ownerDoc ? (ownerDoc.storeId || (Array.isArray(ownerDoc.stores) && ownerDoc.stores[0])) : null;
      const docRole = ownerDoc ? ownerDoc.role : null;

      const allStores = StoreManager.getAllStores();
      const ownedStores = StoreManager.findStoresByOwner({ email: cleanEmail, uid });

      // Determinación de la tienda objetivo:
      // Prioridad:
      // A) Custom Claims (si el claim especifica un storeId)
      // B) Documento Firestore (si el documento en store_owners/{uid} contiene storeId)
      // C) Tienda objetivo solicitada explícitamente (targetStoreId)
      // D) Tiendas registradas a nombre de este usuario (ownerUid o ownerEmail)
      const potentialStoreId = claimStoreId || docStoreId || cleanTargetStoreId;
      let targetStore = null;

      if (potentialStoreId) {
        targetStore = StoreManager.getStoreById(potentialStoreId) || StoreManager.getStoreBySubdomain(potentialStoreId);
      }

      if (!targetStore && ownedStores.length > 0) {
        targetStore = ownedStores[0];
      }

      const assignedRole = claimRole || docRole || (targetStore ? 'store_owner' : null);

      // 3. Caso: Store Owner validado por Custom Claims, Documento Firestore o Propiedad de Tienda
      // IMPORTANTE: Si el usuario tiene una tienda asignada o posee una tienda, NO se le asigna superadmin
      // genérico con tienda 'principal', sino que se le otorga acceso como Dueño a su tienda.
      if (targetStore && (assignedRole === 'store_owner' || ownedStores.some(s => s.id === targetStore.id) || (!claimRole && cleanEmail !== superadminEmail))) {
        StoreManager.linkStoreOwner({
          storeId: targetStore.id,
          uid,
          email: cleanEmail,
          displayName: displayName || targetStore.name,
          role: 'store_owner'
        });

        sendJson(res, 200, {
          ok: true,
          role: 'store_owner',
          storeId: targetStore.id,
          subdomain: targetStore.subdomain,
          storeName: targetStore.name,
          plan: targetStore.plan || 'Starter',
          verifiedVia: claimStoreId ? 'custom_claims' : (docStoreId ? 'firestore_document' : 'store_ownership'),
          token: `capfit_owner_fb_${uid}_${Date.now()}`,
          user: { uid, email: cleanEmail, displayName: displayName || targetStore.name, photoURL },
          message: `Acceso concedido a ${targetStore.name} (${targetStore.subdomain}.capfit.store)`
        });
        return;
      }

      // 4. Caso: SuperAdmin de la plataforma (restringido a correo de superadmin o claim explícito de superadmin)
      const isSuperAdmin = (claimRole === 'superadmin') || (cleanEmail === superadminEmail) || (cleanEmail === 'admin@capfit.shop');
      if (isSuperAdmin) {
        const storeToManage = targetStore || StoreManager.getStoreById('principal') || allStores[0];
        sendJson(res, 200, {
          ok: true,
          role: 'superadmin',
          storeId: storeToManage ? storeToManage.id : 'principal',
          subdomain: storeToManage ? storeToManage.subdomain : 'capfit',
          storeName: storeToManage ? storeToManage.name : 'CAPFIT Platform Admin',
          token: `capfit_superadmin_fb_${uid}_${Date.now()}`,
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

  // 1.06 POST /api/admin/auth/firebase-register (Registro de nueva tienda para Dueño vía Firebase Auth)
  if (reqPath === '/api/admin/auth/firebase-register' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { uid, email, displayName, storeName, subdomain, plan, tagline } = JSON.parse(raw.toString() || '{}');
      if (!uid || !email) {
        sendJson(res, 400, { ok: false, error: 'Se requiere cuenta Firebase Auth válida (uid y email).' });
        return;
      }
      if (!subdomain || !storeName) {
        sendJson(res, 400, { ok: false, error: 'El nombre de la tienda y el subdominio son obligatorios.' });
        return;
      }

      const cleanEmail = email.toLowerCase().trim();
      const newStore = StoreManager.createStore({
        subdomain,
        name: storeName,
        username: subdomain.toLowerCase().replace(/[^a-z0-9]/g, ''),
        ownerEmail: cleanEmail,
        ownerUid: uid,
        plan: plan || 'Starter',
        tagline: tagline || `Tienda oficial de gorras de ${storeName}`
      });

      sendJson(res, 201, {
        ok: true,
        role: 'store_owner',
        storeId: newStore.id,
        subdomain: newStore.subdomain,
        storeName: newStore.name,
        plan: newStore.plan,
        store: newStore,
        token: `capfit_owner_fb_${uid}_${Date.now()}`,
        message: `¡Tienda "${newStore.name}" creada exitosamente! Subdominio: ${newStore.subdomain}.capfit.store`
      });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
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
        message: `Tienda "${newStore.name}" creada con éxito en ${newStore.subdomain}.capfit.store`,
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
    const targetStoreId = qs.store || qs.storeId || currentStore.id;
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

  // 4.1 POST /api/admin/products/sync (Sincronización forzada con Firestore para la tienda)
  if (reqPath === '/api/admin/products/sync' && req.method === 'POST') {
    try {
      const targetStoreId = qs.store || currentStore.id;
      const resSync = await StoreManager.syncStoreProductsToFirestore(targetStoreId);
      sendJson(res, 200, { ok: true, ...resSync, message: `Catálogo de "${targetStoreId}" sincronizado en Firestore` });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
    return;
  }

  // 5. DELETE /api/admin/products/:id (Eliminar producto de la tienda y de Firestore)
  if (reqPath.startsWith('/api/admin/products/') && req.method === 'DELETE') {
    try {
      const targetId = decodeURIComponent(reqPath.replace('/api/admin/products/', ''));
      const targetStoreId = qs.store || currentStore.id;
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

  // 6. POST /api/admin/upload (Subida de fotos de productos convertidas a WebP)
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
  if (reqPath === '/favicon.ico') {
    res.writeHead(204, corsHeaders());
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