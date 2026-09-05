const fs = require('fs');
const path = require('path');

let FirebaseDb = null;
try {
  FirebaseDb = require('./firebase-db');
} catch (e) {
  console.warn('Firebase DB no cargado:', e.message);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORES_FILE = path.join(DATA_DIR, 'stores.json');
const STORES_DATA_DIR = path.join(DATA_DIR, 'stores');
const TEMPLATE_PRODUCTS_FILE = path.join(__dirname, '..', 'assets', 'gorras.json');
const TEMPLATE_ORDERS_FILE = path.join(__dirname, '..', 'assets', 'orders.json');

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORES_DATA_DIR)) fs.mkdirSync(STORES_DATA_DIR, { recursive: true });
}

function getCurrentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function initDefaultStores() {
  ensureDirectories();
  if (!fs.existsSync(STORES_FILE)) {
    const currentPeriod = getCurrentPeriod();
    const defaultStores = [
      {
        id: 'principal',
        subdomain: 'capfit',
        fullDomain: 'capfit.shop',
        name: 'CAPFIT Oficial',
        tagline: 'Gorras premium y probador virtual con IA',
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'capfit2026',
        ownerEmail: 'admin@capfit.shop',
        plan: 'Enterprise',
        aiMonthlyLimit: 100,
        aiGenerationsUsed: 12,
        aiCurrentPeriod: currentPeriod,
        brandColor: '#111111',
        createdAt: new Date().toISOString(),
        active: true
      },
      {
        id: 'tienda1',
        subdomain: 'tienda1',
        fullDomain: 'tienda1.capfit.shop',
        name: 'StreetWear Caps',
        tagline: 'Colecciones urbanas y de autor',
        username: 'admin_tienda1',
        password: 'tienda1pass',
        ownerEmail: 'contacto@tienda1.com',
        plan: 'Starter',
        aiMonthlyLimit: 100,
        aiGenerationsUsed: 26,
        aiCurrentPeriod: currentPeriod,
        brandColor: '#0f172a',
        createdAt: new Date().toISOString(),
        active: true
      },
      {
        id: 'tienda2',
        subdomain: 'tienda2',
        fullDomain: 'tienda2.capfit.shop',
        name: 'Vintage Headwear',
        tagline: 'Gorras retro y clásicas personalizadas',
        username: 'admin_tienda2',
        password: 'tienda2pass',
        ownerEmail: 'hola@vintagecaps.com',
        plan: 'Pro',
        aiMonthlyLimit: 100,
        aiGenerationsUsed: 98,
        aiCurrentPeriod: currentPeriod,
        brandColor: '#7c2d12',
        createdAt: new Date().toISOString(),
        active: true
      }
    ];
    fs.writeFileSync(STORES_FILE, JSON.stringify(defaultStores, null, 2), 'utf8');

    // Inicializar datos para cada tienda
    defaultStores.forEach(st => initStoreDataFiles(st.id));
  }
}

function initStoreDataFiles(storeId) {
  ensureDirectories();
  const storeFolder = path.join(STORES_DATA_DIR, storeId);
  if (!fs.existsSync(storeFolder)) fs.mkdirSync(storeFolder, { recursive: true });

  const pFile = path.join(storeFolder, 'products.json');
  const oFile = path.join(storeFolder, 'orders.json');

  if (!fs.existsSync(pFile)) {
    if (fs.existsSync(TEMPLATE_PRODUCTS_FILE)) {
      const template = JSON.parse(fs.readFileSync(TEMPLATE_PRODUCTS_FILE, 'utf8'));
      fs.writeFileSync(pFile, JSON.stringify(template, null, 2), 'utf8');
    } else {
      fs.writeFileSync(pFile, '[]', 'utf8');
    }
  }

  if (!fs.existsSync(oFile)) {
    if (storeId === 'principal' && fs.existsSync(TEMPLATE_ORDERS_FILE)) {
      const template = JSON.parse(fs.readFileSync(TEMPLATE_ORDERS_FILE, 'utf8'));
      fs.writeFileSync(oFile, JSON.stringify(template, null, 2), 'utf8');
    } else {
      fs.writeFileSync(oFile, '[]', 'utf8');
    }
  }
}

function getAllStores() {
  initDefaultStores();
  try {
    const raw = fs.readFileSync(STORES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error leyendo stores.json:', e);
    return [];
  }
}

function saveStores(stores) {
  ensureDirectories();
  fs.writeFileSync(STORES_FILE, JSON.stringify(stores, null, 2), 'utf8');

  // Sincronizar en segundo plano con Firebase Firestore
  if (FirebaseDb && typeof FirebaseDb.saveStore === 'function') {
    stores.forEach(st => {
      FirebaseDb.saveStore({
        id: st.id,
        subdomain: st.subdomain,
        name: st.name,
        tagline: st.tagline || '',
        adminUsername: st.username,
        adminPassword: st.password,
        plan: st.plan || 'Starter',
        aiMonthlyLimit: st.aiMonthlyLimit || 100,
        aiGenerationsUsed: st.aiGenerationsUsed || 0,
        aiPeriod: st.aiCurrentPeriod || getCurrentPeriod(),
        active: Boolean(st.active),
        createdAt: st.createdAt || new Date().toISOString()
      }).catch(err => console.warn('Firestore store sync note:', err.message));
    });
  }
}

function getStoreById(id) {
  const stores = getAllStores();
  return stores.find(s => s.id === id || s.subdomain === id) || null;
}

function getStoreBySubdomain(subdomain) {
  const stores = getAllStores();
  const clean = (subdomain || '').toLowerCase().trim();
  return stores.find(s => s.subdomain.toLowerCase() === clean) || null;
}

function resolveStoreFromRequest(req) {
  initDefaultStores();
  const host = (req.headers.host || '').toLowerCase();
  
  // 1. Detección por headers explícitos
  const headerStore = req.headers['x-store-id'] || req.headers['x-store-subdomain'];
  if (headerStore) {
    const s = getStoreById(headerStore) || getStoreBySubdomain(headerStore);
    if (s) return s;
  }

  // 2. Detección por query string (?store=tienda1 o ?tienda=tienda1)
  try {
    const urlObj = new URL(req.url, `http://${host || 'localhost'}`);
    const qsStore = urlObj.searchParams.get('store') || urlObj.searchParams.get('tienda');
    if (qsStore) {
      const s = getStoreById(qsStore) || getStoreBySubdomain(qsStore);
      if (s) return s;
    }
  } catch (_) {}

  // 3. Detección por subdominio en el Host header
  // Ejemplos: "tienda1.capfit.shop", "tienda2.capfit.shop", "tienda1.localhost:3000"
  const hostWithoutPort = host.split(':')[0];
  const parts = hostWithoutPort.split('.');
  if (parts.length >= 3) {
    const sub = parts[0];
    if (sub !== 'www' && sub !== 'api' && sub !== 'ais-dev' && sub !== 'ais-pre') {
      const s = getStoreBySubdomain(sub);
      if (s) return s;
    }
  }

  // Fallback: tienda principal CAPFIT
  return getStoreById('principal') || getAllStores()[0];
}

function getStoreProductsPath(storeId) {
  initStoreDataFiles(storeId);
  return path.join(STORES_DATA_DIR, storeId, 'products.json');
}

function getStoreOrdersPath(storeId) {
  initStoreDataFiles(storeId);
  return path.join(STORES_DATA_DIR, storeId, 'orders.json');
}

function readStoreProducts(storeId) {
  const filePath = getStoreProductsPath(storeId);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeStoreProducts(storeId, products) {
  const filePath = getStoreProductsPath(storeId);
  fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf8');

  // Sincronizar productos en Firestore
  if (FirebaseDb && typeof FirebaseDb.saveProduct === 'function') {
    products.forEach(p => {
      FirebaseDb.saveProduct({
        id: String(p.id),
        storeId: storeId,
        nombre: p.nombre || '',
        precio: Number(p.precio) || 0,
        precioAnterior: p.precioAnterior ? Number(p.precioAnterior) : null,
        categoria: p.tipo || 'gorra',
        tag: p.badge || '',
        stock: p.stock !== undefined ? Number(p.stock) : 10,
        imagen: p.imgPreview || p.imgFrontal || '',
        descripcion: (p.detalles || []).join(', '),
        color: (p.colores && p.colores[0] && p.colores[0].name) || 'Varios',
        esNuevo: Boolean(p.badge && p.badge.toLowerCase().includes('nuevo')),
        destacado: Boolean(p.rating && p.rating >= 4.9),
        detalles: Array.isArray(p.detalles) ? p.detalles : []
      }).catch(err => console.warn('Firestore product sync note:', err.message));
    });
  }
}

function readStoreOrders(storeId) {
  const filePath = getStoreOrdersPath(storeId);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeStoreOrders(storeId, orders) {
  const filePath = getStoreOrdersPath(storeId);
  fs.writeFileSync(filePath, JSON.stringify(orders, null, 2), 'utf8');

  // Sincronizar órdenes en Firestore
  if (FirebaseDb && typeof FirebaseDb.saveOrder === 'function') {
    orders.forEach(o => {
      FirebaseDb.saveOrder({
        id: String(o.id),
        storeId: storeId,
        customer: o.customer || {},
        items: Array.isArray(o.items) ? o.items : [],
        total: Number(o.total) || 0,
        subtotal: Number(o.subtotal) || 0,
        shippingCost: Number(o.shipping) || 0,
        status: o.shippingStatus || 'Por preparar',
        paymentStatus: o.paymentStatus || 'Aprobado',
        createdAt: o.date || new Date().toISOString()
      }).catch(err => console.warn('Firestore order sync note:', err.message));
    });
  }
}

/**
 * Control de cuota mensual de IA con reinicio automático cada mes
 */
function checkAndDeductAiCredit(storeId) {
  const stores = getAllStores();
  const idx = stores.findIndex(s => s.id === storeId || s.subdomain === storeId);
  if (idx === -1) {
    return { ok: false, error: 'Tienda no registrada para consumo de IA' };
  }

  const store = stores[idx];
  const currentPeriod = getCurrentPeriod();

  // Reinicio automático de cuota mensual al cambiar de mes
  if (store.aiCurrentPeriod !== currentPeriod) {
    store.aiCurrentPeriod = currentPeriod;
    store.aiGenerationsUsed = 0;
  }

  const limit = store.aiMonthlyLimit !== undefined ? Number(store.aiMonthlyLimit) : 100;
  const used = Number(store.aiGenerationsUsed) || 0;

  if (used >= limit) {
    saveStores(stores);
    return {
      ok: false,
      error: 'Límite mensual de pruebas con IA alcanzado',
      code: 'MONTHLY_AI_LIMIT_REACHED',
      storeName: store.name,
      subdomain: store.subdomain,
      used,
      limit,
      remaining: 0,
      period: currentPeriod,
      message: `La tienda "${store.name}" (${store.subdomain}.capfit.shop) ha alcanzado su límite mensual de ${limit} generaciones de IA (${used}/${limit}) para el período ${currentPeriod}. El cupo se reiniciará el próximo mes o podés ampliar el plan.`
    };
  }

  // Descontar 1 generación
  store.aiGenerationsUsed = used + 1;
  saveStores(stores);

  // Registrar auditoría de IA en Firestore
  if (FirebaseDb && typeof FirebaseDb.logAITryOn === 'function') {
    FirebaseDb.logAITryOn({
      storeId: store.id,
      storeName: store.name,
      subdomain: store.subdomain,
      period: currentPeriod,
      quotaUsed: store.aiGenerationsUsed,
      quotaLimit: limit,
      status: 'consumed'
    }).catch(err => console.warn('Firestore AI log note:', err.message));
  }

  return {
    ok: true,
    storeId: store.id,
    storeName: store.name,
    used: store.aiGenerationsUsed,
    limit,
    remaining: Math.max(0, limit - store.aiGenerationsUsed),
    period: currentPeriod
  };
}

/**
 * Obtener estado de cuota de IA sin descontar
 */
function getAiQuotaStatus(storeId) {
  const stores = getAllStores();
  const store = stores.find(s => s.id === storeId || s.subdomain === storeId);
  if (!store) return null;

  const currentPeriod = getCurrentPeriod();
  let used = store.aiGenerationsUsed || 0;
  if (store.aiCurrentPeriod !== currentPeriod) {
    used = 0;
  }
  const limit = store.aiMonthlyLimit !== undefined ? Number(store.aiMonthlyLimit) : 100;

  return {
    storeId: store.id,
    storeName: store.name,
    subdomain: store.subdomain,
    fullDomain: `${store.subdomain}.capfit.shop`,
    plan: store.plan || 'Starter',
    limit,
    used,
    remaining: Math.max(0, limit - used),
    period: currentPeriod,
    percentUsed: Math.min(100, Math.round((used / limit) * 100))
  };
}

/**
 * Crear nueva tienda
 */
function createStore({ subdomain, name, username, password, plan, aiMonthlyLimit, ownerEmail, brandColor }) {
  const stores = getAllStores();
  const cleanSub = (subdomain || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');

  if (!cleanSub) throw new Error('El subdominio es obligatorio y debe ser alfanumérico.');
  if (stores.some(s => s.subdomain.toLowerCase() === cleanSub)) {
    throw new Error(`El subdominio "${cleanSub}.capfit.shop" ya está registrado.`);
  }

  const cleanUser = (username || cleanSub).trim();
  if (stores.some(s => s.username.toLowerCase() === cleanUser.toLowerCase())) {
    throw new Error(`El usuario "${cleanUser}" ya existe.`);
  }

  const currentPeriod = getCurrentPeriod();
  const newStore = {
    id: cleanSub,
    subdomain: cleanSub,
    fullDomain: `${cleanSub}.capfit.shop`,
    name: (name || `Tienda ${cleanSub}`).trim(),
    tagline: 'Tienda de gorras personalizada',
    username: cleanUser,
    password: (password || '123456').trim(),
    ownerEmail: (ownerEmail || `contacto@${cleanSub}.com`).trim(),
    plan: plan || 'Starter',
    aiMonthlyLimit: aiMonthlyLimit ? Number(aiMonthlyLimit) : 100,
    aiGenerationsUsed: 0,
    aiCurrentPeriod: currentPeriod,
    brandColor: brandColor || '#111111',
    createdAt: new Date().toISOString(),
    active: true
  };

  stores.push(newStore);
  saveStores(stores);
  initStoreDataFiles(newStore.id);

  return newStore;
}

/**
 * Actualizar configuración / plan / cuota de una tienda
 */
function updateStore(id, updates) {
  const stores = getAllStores();
  const idx = stores.findIndex(s => s.id === id || s.subdomain === id);
  if (idx === -1) throw new Error('Tienda no encontrada');

  const s = stores[idx];
  if (updates.name !== undefined) s.name = updates.name.trim();
  if (updates.tagline !== undefined) s.tagline = updates.tagline.trim();
  if (updates.username !== undefined && updates.username.trim()) s.username = updates.username.trim();
  if (updates.password !== undefined && updates.password.trim()) s.password = updates.password.trim();
  if (updates.plan !== undefined) s.plan = updates.plan;
  if (updates.aiMonthlyLimit !== undefined) s.aiMonthlyLimit = Number(updates.aiMonthlyLimit);
  if (updates.aiGenerationsUsed !== undefined) s.aiGenerationsUsed = Number(updates.aiGenerationsUsed);
  if (updates.resetAiUsage === true) s.aiGenerationsUsed = 0;
  if (updates.brandColor !== undefined) s.brandColor = updates.brandColor;
  if (updates.active !== undefined) s.active = Boolean(updates.active);

  stores[idx] = s;
  saveStores(stores);
  return s;
}

function getDatabaseInfo() {
  const status = FirebaseDb && typeof FirebaseDb.getConnectionStatus === 'function'
    ? FirebaseDb.getConnectionStatus()
    : { isConnected: false, connectionError: null };

  return {
    provider: 'Firebase Firestore',
    edition: 'Enterprise Free Tier / Spark',
    projectId: 'applied-sunlight-dgtt6',
    databaseId: 'ai-studio-capfit-89d6a925-ec0e-426b-9d91-c793f721e963',
    connected: status.isConnected,
    collections: ['stores', 'products', 'orders', 'ai_logs'],
    multiTenant: true,
    statusText: status.isConnected ? 'Conectada y Operativa' : 'Verificando enlace'
  };
}

module.exports = {
  initDefaultStores,
  getAllStores,
  getStoreById,
  getStoreBySubdomain,
  resolveStoreFromRequest,
  readStoreProducts,
  writeStoreProducts,
  readStoreOrders,
  writeStoreOrders,
  checkAndDeductAiCredit,
  getAiQuotaStatus,
  createStore,
  updateStore,
  getCurrentPeriod,
  getDatabaseInfo
};
