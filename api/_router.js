/**
 * api/_router.js
 * Enrutador unificado y centralizado para todos los endpoints de la API (/api/*).
 *
 * Consolida el 100% de la lógica de backend bajo una arquitectura limpia y desacoplada,
 * permitiendo ejecutar tanto en Vercel Serverless (Catch-All api/[...slug].js)
 * como en el servidor Node local (server.js), consumiendo exactamente 1 Función Serverless
 * en el plan Hobby de Vercel.
 */

const path = require('path');
const fs = require('fs');

const { readBody, corsHeaders, sendJson, proxyRequest } = require('./_lib/http-helpers.js');
const handleGptEdit = require('./_handlers/gpt-edit.js');
const handleFalSubmit = require('./_handlers/fal-submit.js');
const handleFalStatus = require('./_handlers/fal-status.js');
const handleFalResult = require('./_handlers/fal-result.js');
const handleAnthropic = require('./_handlers/anthropic.js');

let StoreManager = null;
try {
  StoreManager = require('../src/store-manager.js');
} catch (e) {
  try {
    StoreManager = require('../src/store-manager');
  } catch (err) {
    console.warn('StoreManager no encontrado en api/_router:', err.message);
  }
}

let FirebaseDb = null;
try {
  FirebaseDb = require('../src/firebase-db.js');
} catch (e) {
  try {
    FirebaseDb = require('../src/firebase-db');
  } catch (err) {
    console.warn('FirebaseDb no encontrado en api/_router:', err.message);
  }
}

// ── Helpers de Autenticación ────────────────────────────────────────────────
function isPasswordValidForStore(st, pass, expectedSuperPassword) {
  if (!st || !pass) return false;
  if (st.password && st.password === pass) return true;
  if (st.adminPassword && st.adminPassword === pass) return true;
  if (pass === '123456') return true; // Contraseña demo para tiendas activas
  if (pass === expectedSuperPassword) return true; // Clave maestra plataforma
  if (st.id === 'tienda1' && pass === 'tienda1pass') return true;
  if (st.id === 'tienda2' && pass === 'tienda2pass') return true;
  return false;
}

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

/**
 * Enrutador principal de la API.
 * Recibe (req, res) compatibles con HTTP nativo de Node.js y Vercel Serverless.
 */
module.exports = async function handleApi(req, res) {
  // 1. Manejo de Preflight CORS (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  // 2. Asegurar inicialización de datos de Firestore / Memoria
  if (StoreManager && typeof StoreManager.ensureInitialized === 'function') {
    await StoreManager.ensureInitialized();
  }

  // 3. Normalizar URL, Pathname y Query Params
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  let urlObj;
  try {
    urlObj = new URL(req.url, `${proto}://${host}`);
  } catch (e) {
    urlObj = new URL(req.url, 'http://localhost');
  }

  let reqPath = urlObj.pathname.replace(/\/$/, '') || '/';
  const qs = Object.fromEntries(urlObj.searchParams.entries());

  // En caso de que Vercel rewrite o slug pase un path sin prefijo /api
  if (!reqPath.startsWith('/api') && reqPath !== '/') {
    reqPath = '/api/' + reqPath.replace(/^\//, '');
  }

  // Resolver tienda actual según petición (host, query string ?store=...)
  const currentStore = (StoreManager && typeof StoreManager.resolveStoreFromRequest === 'function')
    ? StoreManager.resolveStoreFromRequest(req)
    : { id: 'principal', name: 'CAPFIT', subdomain: 'capfit', plan: 'Pro' };

  // ── 0. ESTADO Y HEALTH CHECK ────────────────────────────────────────────────
  if (reqPath === '/api' || reqPath === '/api/health' || reqPath === '/api/status') {
    return sendJson(res, 200, {
      ok: true,
      service: 'CAPFIT API',
      status: 'online',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      routing: 'Catch-All Unified Router'
    }, req);
  }

  // ── 1. ENDPOINTS DE INTELIGENCIA ARTIFICIAL ────────────────────────────────
  if (reqPath === '/api/gpt/edit') {
    return handleGptEdit(req, res);
  }

  if (reqPath === '/api/fal/submit') {
    return handleFalSubmit(req, res, qs);
  }

  if (reqPath === '/api/fal/status') {
    return handleFalStatus(req, res, qs);
  }

  if (reqPath === '/api/fal/result') {
    return handleFalResult(req, res, qs);
  }

  if (reqPath === '/api/anthropic') {
    return handleAnthropic(req, res);
  }

  // ── 2. ENDPOINTS DE TIENDA Y MULTI-TENANT ───────────────────────────────────

  // 2.1 GET /api/store/current
  if (reqPath === '/api/store/current' && req.method === 'GET') {
    const quota = StoreManager.getAiQuotaStatus(currentStore.id);
    return sendJson(res, 200, {
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
    }, req);
  }

  // 2.2 GET /api/stores
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
    return sendJson(res, 200, publicList, req);
  }

  // 2.3 GET & PUT /api/stores/:id/about
  if (reqPath.startsWith('/api/stores/') && reqPath.endsWith('/about')) {
    const parts = reqPath.split('/');
    const storeTargetId = decodeURIComponent(parts[3] || '');
    const store = StoreManager.getStoreById(storeTargetId);
    if (!store) {
      return sendJson(res, 404, { error: 'Tienda no encontrada' }, req);
    }

    if (req.method === 'GET') {
      const sections = StoreManager.getStoreSections(store.id);
      return sendJson(res, 200, { ok: true, storeId: store.id, about: (sections && sections.about) || store.about || null }, req);
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw.toString() || '{}');
        const updatedSections = StoreManager.updateStoreSections(store.id, 'about', body);
        return sendJson(res, 200, {
          ok: true,
          storeId: store.id,
          about: updatedSections.about,
          message: 'Sobre Nosotros sincronizado exitosamente'
        }, req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message || 'Error al guardar sobre nosotros' }, req);
      }
    }
  }

  // 2.4 GET & PUT /api/stores/:id/sections
  if (reqPath.startsWith('/api/stores/') && reqPath.endsWith('/sections')) {
    const parts = reqPath.split('/');
    const storeTargetId = decodeURIComponent(parts[3] || '');
    let store = StoreManager.getStoreById(storeTargetId) || StoreManager.getStoreBySubdomain(storeTargetId);
    if (!store && (storeTargetId.startsWith('ais-') || storeTargetId === 'principal')) {
      store = StoreManager.getStoreById('principal') || StoreManager.getAllStores()[0];
    }
    if (!store) {
      return sendJson(res, 404, { error: 'Tienda no encontrada' }, req);
    }

    if (req.method === 'GET') {
      const sections = StoreManager.getStoreSections(store.id);
      return sendJson(res, 200, { ok: true, storeId: store.id, sections }, req);
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
        return sendJson(res, 200, {
          ok: true,
          storeId: store.id,
          sections: updatedSections,
          message: 'Secciones guardadas con éxito'
        }, req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message || 'Error al guardar secciones' }, req);
      }
    }
  }

  // 2.5 GET /api/database/status
  if (reqPath === '/api/database/status' && req.method === 'GET') {
    const dbInfo = StoreManager.getDatabaseInfo ? StoreManager.getDatabaseInfo() : { provider: 'Firebase Firestore', connected: true };
    return sendJson(res, 200, { ok: true, database: dbInfo }, req);
  }

  // ── 3. AUTENTICACIÓN Y ADMINISTRACIÓN ──────────────────────────────────────

  // 3.1 POST /api/admin/login
  if (reqPath === '/api/admin/login' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { username, password, storeId } = JSON.parse(raw.toString() || '{}');
      const expectedSuperPassword = process.env.ADMIN_PASSWORD || 'capfit2026';
      const cleanPass = (password || '').trim();
      const cleanUser = (username || '').trim();
      const cleanStoreId = (storeId && typeof storeId === 'string' && !storeId.startsWith('ais-')) ? storeId.trim() : '';

      if (!cleanPass) {
        return sendJson(res, 400, { ok: false, error: 'Por favor, ingresá la contraseña.' }, req);
      }

      const allStores = StoreManager.getAllStores();
      let matchedStore = null;

      if (cleanUser) {
        matchedStore = allStores.find(s => matchesStoreIdentifier(s, cleanUser) && isPasswordValidForStore(s, cleanPass, expectedSuperPassword));
        if (!matchedStore && cleanPass === expectedSuperPassword) {
          matchedStore = allStores.find(s => matchesStoreIdentifier(s, cleanUser));
        }
      }

      if (!matchedStore && cleanStoreId) {
        const target = StoreManager.getStoreById(cleanStoreId) || StoreManager.getStoreBySubdomain(cleanStoreId);
        if (target && isPasswordValidForStore(target, cleanPass, expectedSuperPassword)) {
          matchedStore = target;
        }
      }

      if (!matchedStore && currentStore && currentStore.id !== 'principal' && isPasswordValidForStore(currentStore, cleanPass, expectedSuperPassword)) {
        matchedStore = currentStore;
      }

      const isSuperAdminUser = !cleanUser || cleanUser.toLowerCase() === 'admin' || cleanUser.toLowerCase() === 'superadmin' || cleanUser.toLowerCase() === 'admin@capfit.shop' || cleanUser.toLowerCase() === (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com').toLowerCase();

      if (cleanPass === expectedSuperPassword && (isSuperAdminUser || !matchedStore)) {
        const targetStore = matchedStore || (cleanStoreId ? StoreManager.getStoreById(cleanStoreId) : null) || (currentStore && currentStore.id !== 'principal' ? currentStore : null) || StoreManager.getStoreById('principal') || allStores[0];
        return sendJson(res, 200, {
          ok: true,
          role: 'superadmin',
          storeId: targetStore ? targetStore.id : 'principal',
          subdomain: targetStore ? targetStore.subdomain : 'capfit',
          storeName: targetStore ? targetStore.name : 'CAPFIT Platform Admin',
          token: 'capfit_superadmin_' + Date.now(),
          message: `Autenticación exitosa como Administrador (${targetStore ? targetStore.name : 'CAPFIT'})`
        }, req);
      }

      if (matchedStore) {
        return sendJson(res, 200, {
          ok: true,
          role: 'store_owner',
          storeId: matchedStore.id,
          subdomain: matchedStore.subdomain,
          storeName: matchedStore.name,
          plan: matchedStore.plan || 'Starter',
          token: `capfit_store_${matchedStore.id}_` + Date.now(),
          message: `Bienvenido al panel de ${matchedStore.name}`
        }, req);
      }

      return sendJson(res, 401, {
        ok: false,
        error: 'Credenciales inválidas. Comprobá el usuario/email y contraseña de tu tienda.'
      }, req);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: 'Datos de login inválidos: ' + e.message }, req);
    }
  }

  // 3.2 POST /api/admin/auth/firebase-verify
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
        return sendJson(res, 400, { ok: false, error: 'Datos de Firebase Auth incompletos (uid y email requeridos).' }, req);
      }

      const cleanEmail = email.toLowerCase().trim();
      const superadminEmail = (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com').toLowerCase().trim();
      const cleanTargetStoreId = (targetStoreId && typeof targetStoreId === 'string' && !targetStoreId.startsWith('ais-')) ? targetStoreId.trim() : null;

      let ownerDoc = firestoreUserData;
      if (!ownerDoc && FirebaseDb && typeof FirebaseDb.getStoreOwner === 'function') {
        try {
          ownerDoc = await FirebaseDb.getStoreOwner(uid);
        } catch (dbErr) {
          console.warn('[firebase-verify] No se pudo leer store_owners doc:', dbErr.message);
        }
      }

      const claimStoreId = customClaims.storeId || customClaims.store_id || null;
      const claimRole = customClaims.role || (customClaims.admin ? 'superadmin' : null);
      const docStoreId = ownerDoc ? (ownerDoc.storeId || (Array.isArray(ownerDoc.stores) && ownerDoc.stores[0])) : null;
      const docRole = ownerDoc ? ownerDoc.role : null;

      const allStores = StoreManager.getAllStores();
      const ownedStores = StoreManager.findStoresByOwner({ email: cleanEmail, uid });

      const potentialStoreId = claimStoreId || docStoreId || cleanTargetStoreId;
      let targetStore = null;

      if (potentialStoreId) {
        targetStore = StoreManager.getStoreById(potentialStoreId) || StoreManager.getStoreBySubdomain(potentialStoreId);
      }

      if (!targetStore && ownedStores.length > 0) {
        targetStore = ownedStores[0];
      }

      const assignedRole = claimRole || docRole || (targetStore ? 'store_owner' : null);

      if (targetStore && (assignedRole === 'store_owner' || ownedStores.some(s => s.id === targetStore.id) || (!claimRole && cleanEmail !== superadminEmail))) {
        StoreManager.linkStoreOwner({
          storeId: targetStore.id,
          uid,
          email: cleanEmail,
          displayName: displayName || targetStore.name,
          role: 'store_owner'
        });

        return sendJson(res, 200, {
          ok: true,
          role: 'store_owner',
          storeId: targetStore.id,
          subdomain: targetStore.subdomain,
          storeName: targetStore.name,
          plan: targetStore.plan || 'Starter',
          verifiedVia: claimStoreId ? 'custom_claims' : (docStoreId ? 'firestore_document' : 'store_ownership'),
          token: `capfit_owner_fb_${uid}_${Date.now()}`,
          user: { uid, email: cleanEmail, displayName: displayName || targetStore.name, photoURL },
          message: `Acceso concedido a ${targetStore.name}`
        }, req);
      }

      const isSuperAdmin = (claimRole === 'superadmin') || (cleanEmail === superadminEmail) || (cleanEmail === 'admin@capfit.shop');
      if (isSuperAdmin) {
        const storeToManage = targetStore || StoreManager.getStoreById('principal') || allStores[0];
        return sendJson(res, 200, {
          ok: true,
          role: 'superadmin',
          storeId: storeToManage ? storeToManage.id : 'principal',
          subdomain: storeToManage ? storeToManage.subdomain : 'capfit',
          storeName: storeToManage ? storeToManage.name : 'CAPFIT Platform Admin',
          token: `capfit_superadmin_fb_${uid}_${Date.now()}`,
          user: { uid, email: cleanEmail, displayName: displayName || 'SuperAdmin', photoURL },
          message: `Autenticación exitosa como Administrador`
        }, req);
      }

      return sendJson(res, 200, {
        ok: false,
        code: 'NO_STORE_REGISTERED',
        error: 'Tu usuario está autenticado con Firebase Auth, pero aún no tiene una tienda registrada como Dueño.',
        user: { uid, email: cleanEmail, displayName, photoURL }
      }, req);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message }, req);
    }
  }

  // 3.3 POST /api/admin/auth/firebase-register
  if (reqPath === '/api/admin/auth/firebase-register' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { uid, email, displayName, storeName, subdomain, plan, tagline } = JSON.parse(raw.toString() || '{}');
      if (!uid || !email) {
        return sendJson(res, 400, { ok: false, error: 'Se requiere cuenta Firebase Auth válida (uid y email).' }, req);
      }
      if (!subdomain || !storeName) {
        return sendJson(res, 400, { ok: false, error: 'El nombre de la tienda y el subdominio son obligatorios.' }, req);
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

      return sendJson(res, 201, {
        ok: true,
        role: 'store_owner',
        storeId: newStore.id,
        subdomain: newStore.subdomain,
        storeName: newStore.name,
        plan: newStore.plan,
        store: newStore,
        token: `capfit_owner_fb_${uid}_${Date.now()}`,
        message: `¡Tienda "${newStore.name}" creada exitosamente!`
      }, req);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message }, req);
    }
  }

  // 3.4 GET /api/admin/stores
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
    return sendJson(res, 200, detailed, req);
  }

  // 3.5 POST /api/admin/stores
  if (reqPath === '/api/admin/stores' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString() || '{}');
      const newStore = StoreManager.createStore(body);
      return sendJson(res, 201, {
        ok: true,
        message: `Tienda "${newStore.name}" creada con éxito`,
        store: newStore,
        aiQuota: StoreManager.getAiQuotaStatus(newStore.id)
      }, req);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message }, req);
    }
  }

  // 3.6 PUT /api/admin/stores/:id
  if (reqPath.startsWith('/api/admin/stores/') && req.method === 'PUT') {
    try {
      const storeTargetId = decodeURIComponent(reqPath.replace('/api/admin/stores/', ''));
      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');
      const updated = StoreManager.updateStore(storeTargetId, updates);
      return sendJson(res, 200, {
        ok: true,
        message: 'Tienda actualizada',
        store: updated,
        aiQuota: StoreManager.getAiQuotaStatus(updated.id)
      }, req);
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message }, req);
    }
  }

  // ── 4. PRODUCTOS ──────────────────────────────────────────────────────────

  // 4.1 GET /api/products ó /api/gorras
  if ((reqPath === '/api/products' || reqPath === '/api/gorras') && req.method === 'GET') {
    const targetStoreId = qs.store || qs.storeId || currentStore.id;
    const products = StoreManager.readStoreProducts(targetStoreId);
    return sendJson(res, 200, products, req);
  }

  // 4.2 GET /api/admin/products
  if (reqPath === '/api/admin/products' && req.method === 'GET') {
    const targetStoreId = qs.store || qs.storeId || currentStore.id;
    const products = StoreManager.readStoreProducts(targetStoreId);
    return sendJson(res, 200, products, req);
  }

  // 4.3 POST /api/admin/products
  if (reqPath === '/api/admin/products' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const p = JSON.parse(raw.toString() || '{}');
      const targetStoreId = p.storeId || qs.store || currentStore.id;
      if (!p.nombre || p.precio === undefined) {
        return sendJson(res, 400, { ok: false, error: 'El nombre y precio son obligatorios.' }, req);
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
      return sendJson(res, 201, { ok: true, product: newProduct, message: 'Producto guardado exitosamente' }, req);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message }, req);
    }
  }

  // 4.4 PUT /api/admin/products/:id ó /api/gorras/:id
  if ((reqPath.startsWith('/api/admin/products/') || reqPath.startsWith('/api/gorras/')) && req.method === 'PUT') {
    try {
      const targetId = decodeURIComponent(reqPath.replace(/^\/api\/(admin\/products|gorras)\//, ''));
      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');
      const targetStoreId = updates.storeId || qs.store || currentStore.id;
      const products = StoreManager.readStoreProducts(targetStoreId);
      const idx = products.findIndex(p => p.id === targetId);
      if (idx === -1) {
        return sendJson(res, 404, { ok: false, error: 'Producto no encontrado' }, req);
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
      return sendJson(res, 200, { ok: true, product: p, message: 'Producto actualizado' }, req);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message }, req);
    }
  }

  // 4.5 DELETE /api/admin/products/:id ó /api/gorras/:id
  if ((reqPath.startsWith('/api/admin/products/') || reqPath.startsWith('/api/gorras/')) && req.method === 'DELETE') {
    try {
      const targetId = decodeURIComponent(reqPath.replace(/^\/api\/(admin\/products|gorras)\//, ''));
      const targetStoreId = qs.store || currentStore.id;
      const ok = StoreManager.deleteStoreProduct(targetStoreId, targetId);
      if (!ok) {
        return sendJson(res, 404, { ok: false, error: 'Producto no encontrado' }, req);
      }
      return sendJson(res, 200, { ok: true, message: 'Producto eliminado con éxito' }, req);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message }, req);
    }
  }

  // 4.6 GET /api/gorras/:id
  if (reqPath.startsWith('/api/gorras/') && req.method === 'GET') {
    const targetId = decodeURIComponent(reqPath.replace('/api/gorras/', ''));
    const targetStoreId = qs.store || currentStore.id;
    const products = StoreManager.readStoreProducts(targetStoreId);
    const found = products.find(p => p.id === targetId);
    if (!found) {
      return sendJson(res, 404, { ok: false, error: 'Producto no encontrado' }, req);
    }
    return sendJson(res, 200, found, req);
  }

  // 4.7 POST /api/admin/products/sync
  if (reqPath === '/api/admin/products/sync' && req.method === 'POST') {
    try {
      const targetStoreId = qs.store || currentStore.id;
      const resSync = await StoreManager.syncStoreProductsToFirestore(targetStoreId);
      return sendJson(res, 200, { ok: true, ...resSync, message: `Catálogo de "${targetStoreId}" sincronizado en Firestore` }, req);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message }, req);
    }
  }

  // 4.8 POST /api/admin/upload
  if (reqPath === '/api/admin/upload' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const { filename, base64 } = JSON.parse(raw.toString() || '{}');
      if (!base64) {
        return sendJson(res, 400, { ok: false, error: 'No se envió la imagen base64' }, req);
      }
      const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      const origExt = path.extname(filename || '');
      const safeBase = path.basename(filename || 'gorra', origExt).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFilename = `${safeBase}_${Date.now()}.webp`;

      const uploadDir = path.join(__dirname, '..', 'assets', 'gorras');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, safeFilename), buffer);

      return sendJson(res, 200, {
        ok: true,
        url: `assets/gorras/${safeFilename}`
      }, req);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message }, req);
    }
  }

  // ── 5. PEDIDOS (ORDERS) ───────────────────────────────────────────────────

  // 5.1 GET /api/orders
  if (reqPath === '/api/orders' && req.method === 'GET') {
    const targetStoreId = qs.store || currentStore.id;
    const orders = StoreManager.readStoreOrders(targetStoreId);
    return sendJson(res, 200, orders, req);
  }

  // 5.2 POST /api/orders
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
      return sendJson(res, 201, { ok: true, order: newOrder }, req);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message }, req);
    }
  }

  // 5.3 PUT /api/orders/:id
  if (reqPath.startsWith('/api/orders/') && req.method === 'PUT') {
    try {
      const orderId = decodeURIComponent(reqPath.replace('/api/orders/', ''));
      const raw = await readBody(req);
      const updates = JSON.parse(raw.toString() || '{}');
      const targetStoreId = updates.storeId || qs.store || currentStore.id;
      const orders = StoreManager.readStoreOrders(targetStoreId);
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx === -1) {
        return sendJson(res, 404, { ok: false, error: 'Pedido no encontrado' }, req);
      }

      const order = orders[idx];
      if (updates.paymentStatus !== undefined) order.paymentStatus = updates.paymentStatus;
      if (updates.shippingStatus !== undefined) order.shippingStatus = updates.shippingStatus;
      if (updates.trackingCode !== undefined) order.trackingCode = updates.trackingCode.trim();
      if (updates.notes !== undefined) order.notes = updates.notes;

      orders[idx] = order;
      StoreManager.writeStoreOrders(targetStoreId, orders);
      return sendJson(res, 200, { ok: true, order }, req);
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: e.message }, req);
    }
  }

  // 5.4 GET /api/orders/:id
  if (reqPath.startsWith('/api/orders/') && req.method === 'GET') {
    const orderId = decodeURIComponent(reqPath.replace('/api/orders/', ''));
    const targetStoreId = qs.store || currentStore.id;
    const orders = StoreManager.readStoreOrders(targetStoreId);
    const found = orders.find(o => o.id === orderId);
    if (!found) {
      return sendJson(res, 404, { ok: false, error: 'Pedido no encontrado' }, req);
    }
    return sendJson(res, 200, found, req);
  }

  // 5.5 DELETE /api/orders/:id
  if (reqPath.startsWith('/api/orders/') && req.method === 'DELETE') {
    const orderId = decodeURIComponent(reqPath.replace('/api/orders/', ''));
    const targetStoreId = qs.store || currentStore.id;
    const orders = StoreManager.readStoreOrders(targetStoreId);
    const filtered = orders.filter(o => o.id !== orderId);
    StoreManager.writeStoreOrders(targetStoreId, filtered);
    return sendJson(res, 200, { ok: true, message: 'Pedido eliminado' }, req);
  }

  // ── 6. RUTA NO ENCONTRADA (404) ───────────────────────────────────────────
  return sendJson(res, 404, {
    ok: false,
    error: `Endpoint de API no encontrado: ${req.method} ${reqPath}`
  }, req);
};
