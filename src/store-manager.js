/**
 * CAPFIT - Gestor Multi-Tienda, Planes y Control de Cuotas de IA (Opción A: store_secrets)
 * Separa los metadatos públicos (colección `stores`) de las credenciales administrativas (`store_secrets`).
 * Sincronización en tiempo real y persistencia 100% en Firebase Firestore con caché de alta velocidad.
 */

const url = require('url');
const FirebaseDb = require('./firebase-db');
const { db } = FirebaseDb;
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  deleteField
} = require('firebase/firestore');

// Planes oficiales actualizados (Octubre 2026) con enrutamiento de modelo ($0.020 vs $0.024)
const PLAN_CONFIG = {
  Free: {
    id: 'free',
    name: 'FREE',
    priceUsd: 0,
    price_monthly_usd: 0,
    price_monthly_ars: 0,
    aiMonthlyLimit: 20,
    generations_per_month: 20,
    limit: 20,
    modelTier: 'standard',
    primaryModel: 'openai/gpt-image-2/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.020,
    showCapfitBranding: true,
    features: [
      'Sin branding CapFit',
      'Catálogo básico',
      'Prueba inicial',
      'Conversión a plan pagado'
    ]
  },
  Starter: {
    id: 'starter',
    name: 'STARTER',
    priceUsd: 10,
    price_monthly_usd: 10,
    price_monthly_ars: 18000,
    aiMonthlyLimit: 150,
    generations_per_month: 150,
    limit: 150,
    modelTier: 'standard',
    primaryModel: 'openai/gpt-image-2/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.020,
    showCapfitBranding: true,
    features: [
      'Sin branding CapFit',
      'Catálogo básico',
      'Email support',
      'Acceso API básico'
    ]
  },
  Growth: {
    id: 'growth',
    name: 'GROWTH',
    priceUsd: 20,
    price_monthly_usd: 20,
    price_monthly_ars: 36000,
    aiMonthlyLimit: 350,
    generations_per_month: 350,
    limit: 350,
    popular: true,
    modelTier: 'hd',
    primaryModel: 'openai/gpt-image-2.5/sunburst/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.024,
    showCapfitBranding: false,
    features: [
      'Con branding personalizado',
      'Analytics básico',
      'Integración TiendaNube',
      'Dashboard',
      'Soporte prioritario'
    ]
  },
  Pro: {
    id: 'pro',
    name: 'PRO',
    priceUsd: 50,
    price_monthly_usd: 50,
    price_monthly_ars: 90000,
    aiMonthlyLimit: 1000,
    generations_per_month: 1000,
    limit: 1000,
    modelTier: 'hd',
    primaryModel: 'openai/gpt-image-2.5/sunburst/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.024,
    showCapfitBranding: false,
    features: [
      'Branding + watermark custom',
      'Analytics avanzado',
      'API access + webhooks',
      'Soporte prioritario',
      'Integración avanzada',
      'Custom dashboard'
    ]
  },
  Enterprise: {
    id: 'enterprise',
    name: 'ENTERPRISE',
    priceUsd: 200,
    price_monthly_usd: 200,
    price_monthly_ars: 360000,
    aiMonthlyLimit: 4000,
    generations_per_month: 4000,
    limit: 4000,
    modelTier: 'hd',
    primaryModel: 'openai/gpt-image-2.5/sunburst/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.024,
    showCapfitBranding: false,
    features: [
      'Generaciones ilimitadas',
      'Account manager dedicado',
      'Integraciones custom',
      'SLA garantizado 99.9%',
      'Soporte 24/7',
      'Priority queue',
      'Custom features'
    ]
  }
};

const RESERVED_SUBDOMAINS = [
  'www',
  'capfit',
  'account',
  'app',
  'shop',
  'shpo',
  'blog',
  'api',
  'admin',
  'portal',
  'dashboard',
  'auth',
  'mail',
  'status',
  'principal',
  'root',
  'static',
  'assets'
];

function getCurrentAiPeriod() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const getCurrentPeriod = getCurrentAiPeriod;

function getPlanDetails(planId) {
  if (!planId) return PLAN_CONFIG.Starter;
  const raw = String(planId).trim();
  if (PLAN_CONFIG[raw]) return PLAN_CONFIG[raw];

  const lower = raw.toLowerCase();
  const match = Object.values(PLAN_CONFIG).find(
    p => p.id === lower || p.name.toLowerCase() === lower
  );
  return match || PLAN_CONFIG.Starter;
}

const getPlanConfig = getPlanDetails;

function getPlansCatalog() {
  return Object.values(PLAN_CONFIG);
}

function getPlanLimit(planId) {
  const plan = getPlanDetails(planId);
  return plan ? plan.aiMonthlyLimit : 150;
}

/**
 * Sanitiza un objeto de tienda garantizando que NUNCA exponga adminUsername ni adminPassword
 */
function sanitizePublicStore(storeData) {
  if (!storeData) return null;
  const { adminUsername, adminPassword, password, username, secret, ...publicFields } = storeData;
  return publicFields;
}

// Tienda principal predeterminada
const defaultPrincipal = {
  id: 'principal',
  subdomain: 'principal',
  fullDomain: 'capfit.store',
  name: 'CAPFIT',
  tagline: 'Probador Virtual IA de Gorras y Anteojos',
  about: 'Plataforma oficial multi-tienda de CapFit.',
  plan: 'Enterprise',
  aiMonthlyLimit: PLAN_CONFIG.Enterprise.aiMonthlyLimit,
  aiGenerationsUsed: 0,
  aiPeriod: getCurrentAiPeriod(),
  brandColor: '#111111',
  active: true,
  createdAt: new Date().toISOString()
};

// Cachés en memoria
const storesCache = new Map([['principal', { ...defaultPrincipal }]]);
const storeSecretsCache = new Map();
const cachedProducts = new Map();
const cachedOrders = new Map();
let isInitialized = false;
let initPromise = null;

/**
 * Inicializa y sincroniza tiendas, productos y órdenes desde Firestore
 */
async function init() {
  if (isInitialized) return Array.from(storesCache.values());
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (FirebaseDb && typeof FirebaseDb.testConnection === 'function') {
        await FirebaseDb.testConnection();
      }

      const dbStores = await FirebaseDb.getStores();
      if (Array.isArray(dbStores) && dbStores.length > 0) {
        dbStores.forEach(st => {
          const sanitized = sanitizePublicStore({
            id: st.id,
            subdomain: st.subdomain || st.id,
            fullDomain: st.fullDomain || `${st.subdomain || st.id}.capfit.store`,
            name: st.name || `Tienda ${st.id}`,
            tagline: st.tagline || '',
            ownerEmail: st.ownerEmail || `admin@${st.subdomain || st.id}.shop`,
            ownerUid: st.ownerUid || null,
            plan: st.plan || 'Starter',
            about: st.about || null,
            sections: st.sections || null,
            aiMonthlyLimit: st.aiMonthlyLimit !== undefined ? Number(st.aiMonthlyLimit) : 150,
            aiGenerationsUsed: st.aiGenerationsUsed !== undefined ? Number(st.aiGenerationsUsed) : 0,
            aiPeriod: st.aiPeriod || getCurrentAiPeriod(),
            brandColor: st.brandColor || '#111111',
            createdAt: st.createdAt || new Date().toISOString(),
            active: st.active !== undefined ? Boolean(st.active) : true
          });
          storesCache.set(sanitized.id, sanitized);
        });
      }

      if (!storesCache.has('principal')) {
        storesCache.set('principal', { ...defaultPrincipal });
      }

      // Cargar productos y órdenes en background
      for (const store of storesCache.values()) {
        const sId = store.id;
        try {
          const prods = await FirebaseDb.getProductsByStore(sId);
          cachedProducts.set(sId, Array.isArray(prods) ? prods : []);
        } catch (_) {
          cachedProducts.set(sId, []);
        }

        try {
          const ords = await FirebaseDb.getOrdersByStore(sId);
          cachedOrders.set(sId, Array.isArray(ords) ? ords : []);
        } catch (_) {
          cachedOrders.set(sId, []);
        }
      }

      isInitialized = true;
    } catch (err) {
      console.warn('[StoreManager] Aviso al sincronizar Firestore en init:', err.message);
    } finally {
      initPromise = null;
    }
    return Array.from(storesCache.values());
  })();

  return initPromise;
}

async function ensureInitialized() {
  if (!isInitialized) {
    await init();
  }
  return true;
}

function getAllStores() {
  return Array.from(storesCache.values()).map(sanitizePublicStore);
}

function getStoreById(id) {
  if (!id) return storesCache.get('principal') || { ...defaultPrincipal };
  const key = String(id).trim();

  if (storesCache.has(key)) {
    return sanitizePublicStore(storesCache.get(key));
  }

  for (const store of storesCache.values()) {
    if (store.subdomain === key || store.id.toLowerCase() === key.toLowerCase()) {
      return sanitizePublicStore(store);
    }
  }

  getStorePublic(key).catch(() => {});
  return key === 'principal' ? { ...defaultPrincipal } : null;
}

function getStoreBySubdomain(subdomain) {
  return getStoreById(subdomain);
}

/**
 * Consulta de tienda pública directamente desde Firestore
 */
async function getStorePublic(storeIdentifier) {
  if (!storeIdentifier) return storesCache.get('principal') || { ...defaultPrincipal };
  const key = String(storeIdentifier).trim();

  try {
    const directRef = doc(db, 'stores', key);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) {
      const sanitized = sanitizePublicStore({ id: directSnap.id, ...directSnap.data() });
      storesCache.set(sanitized.id, sanitized);
      return sanitized;
    }

    const storesCol = collection(db, 'stores');
    const q = query(storesCol, where('subdomain', '==', key));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const docSnap = querySnap.docs[0];
      const sanitized = sanitizePublicStore({ id: docSnap.id, ...docSnap.data() });
      storesCache.set(sanitized.id, sanitized);
      return sanitized;
    }
  } catch (err) {
    console.warn(`[StoreManager] Error consultando tienda '${key}' en Firestore:`, err.message);
  }

  return storesCache.get(key) || (key === 'principal' ? { ...defaultPrincipal } : null);
}

/**
 * Resolución multi-tenant del request por Headers, Dominio o Query Params
 */
function resolveStoreFromRequest(req, bodyObj = null) {
  if (!req) return getStoreById('principal');

  const host = (req.headers && req.headers.host ? req.headers.host : '').toLowerCase().trim();
  const hostWithoutPort = host.split(':')[0];

  const isDevOrSharedEnvironment = (
    hostWithoutPort.includes('localhost') ||
    hostWithoutPort.includes('127.0.0.1') ||
    hostWithoutPort.includes('run.app') ||
    hostWithoutPort.startsWith('ais-') ||
    hostWithoutPort.includes('aistudio') ||
    hostWithoutPort.endsWith('.vercel.app')
  );

  let hostStore = null;

  if (hostWithoutPort === 'admin.capfit.store' || hostWithoutPort.startsWith('admin.')) {
    hostStore = {
      id: 'admin_portal',
      subdomain: 'admin',
      fullDomain: 'admin.capfit.store',
      name: 'Panel de Administración CAPFIT',
      tagline: 'Backoffice y Administración Central',
      isAdminPortal: true,
      active: true
    };
  } else if (hostWithoutPort === 'app.capfit.store' || hostWithoutPort === 'capfit.store' || hostWithoutPort === 'www.capfit.store') {
    hostStore = getStoreById('principal');
  } else if (!isDevOrSharedEnvironment) {
    const all = getAllStores();
    const matchByDomain = all.find(s => (s.fullDomain || '').toLowerCase() === hostWithoutPort);
    if (matchByDomain) {
      hostStore = matchByDomain;
    } else {
      const parts = hostWithoutPort.split('.');
      if (parts.length >= 2) {
        const sub = parts[0];
        if (sub === 'admin' || sub === 'account') {
          hostStore = {
            id: 'admin_portal',
            subdomain: 'admin',
            fullDomain: 'admin.capfit.store',
            name: 'Panel de Administración CAPFIT',
            isAdminPortal: true,
            active: true
          };
        } else if (sub === 'www' || sub === 'capfit' || sub === 'shop' || sub === 'app') {
          hostStore = getStoreById('principal');
        } else {
          const matchBySub = getStoreBySubdomain(sub);
          if (matchBySub) hostStore = matchBySub;
        }
      }
    }
  }

  // Comprobar parámetros explícitos
  let candidateId = null;
  const headerStore = req.headers && (req.headers['x-store-id'] || req.headers['x-tenant-id']);
  if (headerStore) candidateId = String(headerStore).trim();

  if (!candidateId && req.url) {
    try {
      const parsedUrl = url.parse(req.url, true);
      if (parsedUrl.query && (parsedUrl.query.store || parsedUrl.query.tienda || parsedUrl.query.storeId)) {
        candidateId = String(parsedUrl.query.store || parsedUrl.query.tienda || parsedUrl.query.storeId).trim();
      }
    } catch (_) {}
  }

  const parsedBody = bodyObj || req.body;
  if (!candidateId && parsedBody && typeof parsedBody === 'object') {
    if (parsedBody.storeId || parsedBody.store) {
      candidateId = String(parsedBody.storeId || parsedBody.store).trim();
    }
  }

  if (hostStore) {
    if (candidateId) {
      const clean = candidateId.toLowerCase();
      if (clean !== hostStore.id.toLowerCase() && clean !== (hostStore.subdomain || '').toLowerCase()) {
        return hostStore;
      }
    }
    return hostStore;
  }

  if (candidateId) {
    const clean = candidateId.toLowerCase();
    if (clean === 'admin') {
      return {
        id: 'admin_portal',
        subdomain: 'admin',
        fullDomain: 'admin.capfit.store',
        name: 'Panel de Administración CAPFIT',
        isAdminPortal: true,
        active: true
      };
    }
    const found = getStoreById(clean);
    if (found && found.active !== false) return found;
  }

  return getStoreById('principal') || { ...defaultPrincipal };
}

/**
 * Crea o actualiza una tienda separando datos públicos (stores) de credenciales (store_secrets)
 */
async function createOrUpdateStoreWithSecrets(storeInput) {
  const {
    id,
    subdomain,
    name,
    tagline = '',
    about = '',
    adminUsername,
    adminPassword,
    username,
    password,
    plan = 'Starter',
    aiMonthlyLimit,
    active = true,
    brandColor = '#111111',
    ownerEmail = '',
    ownerUid = null
  } = storeInput;

  const storeId = String(id || subdomain || '').trim();
  if (!storeId) {
    throw new Error('Se requiere un id o subdomain para crear o actualizar la tienda.');
  }

  const planDefaults = getPlanDetails(plan);
  const resolvedLimit =
    typeof aiMonthlyLimit === 'number' ? aiMonthlyLimit : planDefaults.aiMonthlyLimit;

  const existing = storesCache.get(storeId) || {};

  // 1. Guardar en stores/{storeId} SIN CREDENCIALES
  const publicStoreData = {
    id: storeId,
    subdomain: subdomain || existing.subdomain || storeId,
    fullDomain: `${subdomain || existing.subdomain || storeId}.capfit.store`,
    name: name || existing.name || storeId,
    tagline: tagline !== undefined ? tagline : existing.tagline || '',
    about: about !== undefined ? about : existing.about || '',
    plan: planDefaults.id,
    aiMonthlyLimit: resolvedLimit,
    aiGenerationsUsed: Number(existing.aiGenerationsUsed || 0),
    aiPeriod: existing.aiPeriod || getCurrentAiPeriod(),
    brandColor: brandColor || existing.brandColor || '#111111',
    ownerEmail: ownerEmail || existing.ownerEmail || '',
    ownerUid: ownerUid || existing.ownerUid || null,
    active: Boolean(active),
    createdAt: existing.createdAt || new Date().toISOString(),
    adminUsername: deleteField(),
    adminPassword: deleteField()
  };

  try {
    await setDoc(doc(db, 'stores', storeId), publicStoreData, { merge: true });
  } catch (err) {
    console.warn('Error guardando store en Firestore:', err.message);
  }

  // 2. Guardar credenciales exclusivamente en store_secrets/{storeId} y caché privada de servidor
  const effectiveUser = adminUsername || username;
  const effectivePass = adminPassword || password;
  if (effectiveUser !== undefined || effectivePass !== undefined) {
    const existingSecret = storeSecretsCache.get(storeId) || {};
    const finalUser = effectiveUser || existingSecret.adminUsername || `admin_${storeId}`;
    const finalPass = effectivePass !== undefined ? effectivePass : (existingSecret.adminPassword || '');
    storeSecretsCache.set(storeId, {
      storeId,
      adminUsername: finalUser,
      adminPassword: finalPass
    });

    const secretData = {
      storeId,
      adminUsername: finalUser,
      adminPassword: finalPass,
      updatedAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, 'store_secrets', storeId), secretData, { merge: true });
    } catch (err) {
      console.warn('Error guardando store_secrets en Firestore:', err.message);
    }
  }

  const cleanCached = sanitizePublicStore({
    ...publicStoreData,
    createdAt: existing.createdAt || new Date().toISOString()
  });
  storesCache.set(storeId, cleanCached);

  return cleanCached;
}

function createStore(params) {
  const cleanSub = (params.subdomain || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');

  if (!cleanSub) throw new Error('El subdominio es obligatorio y debe ser alfanumérico.');
  if (RESERVED_SUBDOMAINS.includes(cleanSub)) {
    throw new Error(`El subdominio "${cleanSub}" está reservado.`);
  }

  const planDetails = getPlanDetails(params.plan || 'starter');
  const limit = params.aiMonthlyLimit !== undefined ? Number(params.aiMonthlyLimit) : planDetails.aiMonthlyLimit;

  const publicData = {
    id: cleanSub,
    subdomain: cleanSub,
    fullDomain: `${cleanSub}.capfit.store`,
    name: (params.name || `Tienda ${cleanSub}`).trim(),
    tagline: (params.tagline || 'Tienda personalizada').trim(),
    ownerEmail: (params.ownerEmail || `contacto@${cleanSub}.com`).trim(),
    ownerUid: params.ownerUid || null,
    plan: planDetails.id,
    planId: planDetails.id,
    aiMonthlyLimit: limit,
    aiGenerationsUsed: 0,
    aiPeriod: getCurrentAiPeriod(),
    brandColor: params.brandColor || '#111111',
    createdAt: new Date().toISOString(),
    active: true
  };

  createOrUpdateStoreWithSecrets({
    ...publicData,
    adminUsername: params.username || params.adminUsername,
    adminPassword: params.password || params.adminPassword
  }).catch(e => console.warn('createStore background sync:', e.message));

  cachedProducts.set(cleanSub, []);
  cachedOrders.set(cleanSub, []);

  return publicData;
}

function updateStore(idOrData, maybeUpdates) {
  let targetId = idOrData;
  let updates = maybeUpdates;

  if (typeof idOrData === 'object' && idOrData !== null && !maybeUpdates) {
    targetId = idOrData.id || idOrData.subdomain;
    updates = idOrData;
  }

  const s = getStoreById(targetId);
  if (!s) throw new Error('Tienda no encontrada');

  if (updates.name !== undefined) s.name = updates.name.trim();
  if (updates.tagline !== undefined) s.tagline = updates.tagline.trim();
  if (updates.plan !== undefined) {
    const pDetails = getPlanDetails(updates.plan);
    s.plan = pDetails.id;
    s.planId = pDetails.id;
    if (updates.aiMonthlyLimit === undefined) {
      s.aiMonthlyLimit = pDetails.aiMonthlyLimit;
    }
  }
  if (updates.planId !== undefined) s.planId = updates.planId;
  if (updates.aiMonthlyLimit !== undefined) s.aiMonthlyLimit = Number(updates.aiMonthlyLimit);
  if (updates.aiGenerationsUsed !== undefined) s.aiGenerationsUsed = Number(updates.aiGenerationsUsed);
  if (updates.resetAiUsage === true) s.aiGenerationsUsed = 0;
  if (updates.brandColor !== undefined) s.brandColor = updates.brandColor;
  if (updates.about !== undefined) s.about = updates.about;
  if (updates.sections !== undefined) s.sections = updates.sections;
  if (updates.active !== undefined) s.active = Boolean(updates.active);
  if (updates.subscriptionStatus !== undefined) s.subscriptionStatus = updates.subscriptionStatus;
  if (updates.subscriptionId !== undefined) s.subscriptionId = updates.subscriptionId;
  if (updates.preapprovalId !== undefined) s.preapprovalId = updates.preapprovalId;
  if (updates.subscribedAt !== undefined) s.subscribedAt = updates.subscribedAt;
  if (updates.payerEmail !== undefined) s.payerEmail = updates.payerEmail;

  storesCache.set(s.id, sanitizePublicStore(s));

  // Actualizar Firestore
  createOrUpdateStoreWithSecrets({
    ...s,
    adminUsername: updates.adminUsername || updates.username,
    adminPassword: updates.adminPassword || updates.password
  }).catch(e => console.warn('updateStore sync:', e.message));

  return s;
}

async function updateStorePlanAndQuota(storeId, planName, customLimit = null) {
  const planDetails = getPlanDetails(planName);
  const newLimit = typeof customLimit === 'number' ? customLimit : planDetails.aiMonthlyLimit;

  return updateStore(storeId, {
    plan: planDetails.id,
    planId: planDetails.id,
    aiMonthlyLimit: newLimit
  });
}

async function deleteStore(storeId) {
  if (!storeId || storeId === 'principal') {
    throw new Error('No se puede eliminar la tienda principal.');
  }
  try {
    await deleteDoc(doc(db, 'stores', storeId));
    await deleteDoc(doc(db, 'store_secrets', storeId));
  } catch (_) {}
  storesCache.delete(storeId);
  storeSecretsCache.delete(storeId);
  cachedProducts.delete(storeId);
  cachedOrders.delete(storeId);
  return true;
}

/**
 * Verificación segura de credenciales contra store_secrets (sin contraseñas de prueba cableadas)
 */
async function verifyStoreCredentials(storeId, username, password) {
  if (!storeId || !password) return { valid: false, reason: 'Credenciales incompletas' };

  const masterPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (masterPassword && password === masterPassword && (!username || username === 'admin' || username === 'superadmin' || username === (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com'))) {
    return { valid: true, role: 'superadmin', storeId: '*' };
  }

  // Verificar primero en caché privada de servidor (para tiendas creadas en la sesión actual)
  const memSecret = storeSecretsCache.get(storeId);
  if (memSecret && memSecret.adminPassword) {
    const userOk = !username || !memSecret.adminUsername || memSecret.adminUsername.toLowerCase() === username.toLowerCase() || storeId.toLowerCase() === username.toLowerCase();
    if (userOk && memSecret.adminPassword === password) {
      return { valid: true, role: 'tenant_admin', storeId };
    }
  }

  // Verificar variable de entorno por tienda opcional: STORE_PASSWORD_<STOREID>
  const envStorePass = process.env[`STORE_PASSWORD_${String(storeId).toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
  if (envStorePass && envStorePass.trim() && password === envStorePass.trim()) {
    return { valid: true, role: 'tenant_admin', storeId };
  }

  try {
    const secretRef = doc(db, 'store_secrets', storeId);
    const secretSnap = await getDoc(secretRef);
    if (!secretSnap.exists()) {
      return { valid: false, reason: 'No existen credenciales configuradas para esta tienda' };
    }

    const secret = secretSnap.data();
    const usernameMatches = !username || !secret.adminUsername || secret.adminUsername.toLowerCase() === username.toLowerCase();
    const passwordMatches = Boolean(secret.adminPassword && secret.adminPassword === password);

    if (usernameMatches && passwordMatches) {
      return { valid: true, role: 'tenant_admin', storeId };
    }
  } catch (err) {
    return { valid: false, reason: `Error al verificar credenciales: ${err.message}` };
  }

  return { valid: false, reason: 'Usuario o contraseña incorrectos' };
}

/**
 * Control y consumo de crédito IA
 */
function checkAndDeductAiCredit(storeOrId) {
  const storeId =
    typeof storeOrId === 'object' && storeOrId !== null
      ? storeOrId.id || storeOrId.subdomain || 'principal'
      : String(storeOrId || 'principal').trim();

  const store = getStoreById(storeId);
  if (!store) {
    return { ok: false, allowed: false, status: 404, error: 'Tienda no registrada para consumo de IA' };
  }

  if (store.active === false) {
    return { ok: false, allowed: false, status: 403, error: 'La tienda se encuentra desactivada' };
  }

  const currentPeriod = getCurrentAiPeriod();
  const planDetails = getPlanDetails(store.plan || store.planId);
  const limit = store.aiMonthlyLimit !== undefined ? Number(store.aiMonthlyLimit) : planDetails.aiMonthlyLimit;

  if (store.aiPeriod !== currentPeriod) {
    store.aiPeriod = currentPeriod;
    store.aiGenerationsUsed = 0;
  }

  let used = Number(store.aiGenerationsUsed || 0);

  if (used >= limit) {
    return {
      ok: false,
      allowed: false,
      status: 429,
      error: 'Límite mensual de pruebas con IA alcanzado',
      code: 'MONTHLY_AI_LIMIT_REACHED',
      storeName: store.name,
      subdomain: store.subdomain,
      used,
      limit,
      remaining: 0,
      period: currentPeriod,
      plan: planDetails.id,
      message: `La tienda "${store.name}" (${store.subdomain}.capfit.store) ha alcanzado su límite mensual de ${limit} generaciones de IA (${used}/${limit}) para el período ${currentPeriod}.`
    };
  }

  used += 1;
  store.aiGenerationsUsed = used;
  storesCache.set(store.id, sanitizePublicStore(store));

  // Persistir en Firestore
  try {
    const storeRef = doc(db, 'stores', store.id);
    updateDoc(storeRef, {
      aiGenerationsUsed: used,
      aiPeriod: currentPeriod
    }).catch(() => {});

    if (FirebaseDb && typeof FirebaseDb.logAITryOn === 'function') {
      FirebaseDb.logAITryOn({
        storeId: store.id,
        storeName: store.name,
        subdomain: store.subdomain,
        period: currentPeriod,
        quotaUsed: used,
        quotaLimit: limit,
        status: 'consumed'
      }).catch(() => {});
    }
  } catch (_) {}

  const remaining = Math.max(0, limit - used);

  return {
    ok: true,
    allowed: true,
    status: 200,
    storeId: store.id,
    storeName: store.name,
    used,
    limit,
    remaining,
    period: currentPeriod,
    plan: planDetails.id,
    store: sanitizePublicStore(store),
    modelRouting: {
      plan: planDetails.id,
      modelTier: planDetails.modelTier,
      primaryModel: planDetails.primaryModel,
      fallbackModel: planDetails.fallbackModel,
      unitCostUsd: planDetails.unitCostUsd,
      showCapfitBranding: planDetails.showCapfitBranding
    },
    quota: {
      used,
      limit,
      remaining,
      period: currentPeriod,
      plan: planDetails.id
    }
  };
}

const checkAndConsumeAiQuota = checkAndDeductAiCredit;

function refundAiCredit(storeId) {
  const store = getStoreById(storeId);
  if (!store) return { ok: false, error: 'Tienda no registrada' };

  const currentPeriod = getCurrentAiPeriod();
  if (store.aiPeriod === currentPeriod && (Number(store.aiGenerationsUsed) || 0) > 0) {
    store.aiGenerationsUsed = Math.max(0, (Number(store.aiGenerationsUsed) || 0) - 1);
    try {
      const storeRef = doc(db, 'stores', store.id);
      updateDoc(storeRef, { aiGenerationsUsed: store.aiGenerationsUsed }).catch(() => {});
    } catch (_) {}
  }

  const planConf = getPlanDetails(store.plan);
  const limit = store.aiMonthlyLimit !== undefined ? Number(store.aiMonthlyLimit) : planConf.aiMonthlyLimit;

  return {
    ok: true,
    storeId: store.id,
    storeName: store.name,
    used: store.aiGenerationsUsed || 0,
    limit,
    remaining: Math.max(0, limit - (store.aiGenerationsUsed || 0)),
    period: currentPeriod
  };
}

function getAiQuotaStatus(storeId) {
  const store = getStoreById(storeId);
  if (!store) return null;

  const currentPeriod = getCurrentAiPeriod();
  let used = Number(store.aiGenerationsUsed || 0);
  if (store.aiPeriod !== currentPeriod) {
    used = 0;
  }
  const planConf = getPlanDetails(store.plan);
  const limit = store.aiMonthlyLimit !== undefined ? Number(store.aiMonthlyLimit) : planConf.aiMonthlyLimit;

  return {
    storeId: store.id,
    storeName: store.name,
    subdomain: store.subdomain,
    fullDomain: `${store.subdomain}.capfit.store`,
    plan: planConf.name,
    planId: planConf.id,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    period: currentPeriod,
    percentUsed: Math.min(100, Math.round((used / limit) * 100))
  };
}

// ── PRODUCTOS Y ÓRDENES ──

function readStoreProducts(storeId) {
  const sId = storeId || 'principal';
  return cachedProducts.get(sId) || [];
}

async function fetchStoreProductsFromDb(storeId) {
  const sId = storeId || 'principal';
  if (FirebaseDb && typeof FirebaseDb.getProductsByStore === 'function') {
    try {
      const prods = await FirebaseDb.getProductsByStore(sId);
      cachedProducts.set(sId, prods);
      return prods;
    } catch (_) {}
  }
  return readStoreProducts(sId);
}

function writeStoreProducts(storeId, products) {
  const sId = storeId || 'principal';
  cachedProducts.set(sId, products);
  if (FirebaseDb && typeof FirebaseDb.saveProduct === 'function') {
    products.forEach(p => {
      FirebaseDb.saveProduct({ ...p, id: String(p.id), storeId: sId }, sId).catch(() => {});
    });
  }
}

function deleteStoreProduct(storeId, productId) {
  const sId = storeId || 'principal';
  let products = readStoreProducts(sId);
  const initialLen = products.length;
  products = products.filter(p => String(p.id) !== String(productId));
  cachedProducts.set(sId, products);
  if (FirebaseDb && typeof FirebaseDb.deleteProduct === 'function') {
    FirebaseDb.deleteProduct(productId, sId).catch(() => {});
  }
  return products.length !== initialLen;
}

function syncStoreProductsToFirestore(storeId) {
  const sId = storeId || 'principal';
  const products = readStoreProducts(sId);
  if (FirebaseDb && typeof FirebaseDb.syncAllStoreProducts === 'function') {
    return FirebaseDb.syncAllStoreProducts(sId, products);
  }
  return Promise.resolve({ ok: true, count: products.length });
}

function readStoreOrders(storeId) {
  const sId = storeId || 'principal';
  return cachedOrders.get(sId) || [];
}

async function fetchStoreOrdersFromDb(storeId) {
  const sId = storeId || 'principal';
  if (FirebaseDb && typeof FirebaseDb.getOrdersByStore === 'function') {
    try {
      const orders = await FirebaseDb.getOrdersByStore(sId);
      cachedOrders.set(sId, orders);
      return orders;
    } catch (_) {}
  }
  return readStoreOrders(sId);
}

function writeStoreOrders(storeId, orders) {
  const sId = storeId || 'principal';
  cachedOrders.set(sId, orders);
  if (FirebaseDb && typeof FirebaseDb.saveOrder === 'function') {
    orders.forEach(o => {
      FirebaseDb.saveOrder({
        id: String(o.id),
        storeId: sId,
        customer: o.customer || {},
        items: Array.isArray(o.items) ? o.items : [],
        total: Number(o.total) || 0,
        subtotal: Number(o.subtotal) || 0,
        shippingCost: Number(o.shipping) || 0,
        status: o.shippingStatus || o.status || 'Por preparar',
        paymentStatus: o.paymentStatus || 'Aprobado',
        createdAt: o.date || o.createdAt || new Date().toISOString()
      }).catch(() => {});
    });
  }
}

// ── SECCIONES Y CONTENIDO ──

function getDefaultSectionsForStore(store) {
  const storeName = (store && store.name) || 'Nuestra Tienda';
  const about = (store && store.about) || {};
  const email = about.email || (store && store.ownerEmail) || `contacto@${(store && store.subdomain) || 'tienda'}.capfit.shop`;
  const phone = about.phone || '+54 9 11 5555-0199';
  const location = about.location || 'Buenos Aires, Argentina';
  const brandName = about.brandName || storeName;

  return {
    home: {
      heroTitle: (store && store.heroTitle) || 'Probátela.\nComprá con confianza.',
      heroSubtitle: (store && store.tagline) || 'Usá IA para verte con tus gorras favoritas antes de comprarlas.',
      heroBadge: '🔥 PROBADOR CON IA EN VIVO',
      heroCtaPrimary: 'PROBAR AHORA →',
      heroCtaSecondary: 'Ver catálogo',
      heroProofCount: '+3.500 personas ya probaron',
      heroRatingText: '★★★★★ 4.9 (327 opiniones)',
      announcementActive: true,
      announcementText1: 'Envío gratis en compras mayores a $39.999',
      announcementText2: '30 días para cambios y devoluciones',
      announcementText3: '¿Necesitás ayuda? Escribinos por WhatsApp',
      trust1Title: 'Probá en 3 pasos',
      trust1Desc: 'Elegí, subí tu foto y mirá el resultado.',
      trust2Title: 'Envíos a todo el país',
      trust2Desc: 'Envío gratis en compras mayores a $39.999.',
      trust3Title: '30 días para cambios',
      trust3Desc: 'Si no te convence, lo cambiás sin problema.',
      trust4Title: 'Compra 100% segura',
      trust4Desc: 'Tus datos están protegidos siempre.',
      catalogHeadline: 'Gorras más vendidas',
      catalogSubtitle: 'Elegí tu modelo favorito y probalo con nuestro probador virtual con Inteligencia Artificial'
    },
    about: {
      brandName: brandName,
      tagline: about.tagline || (store && store.tagline) || 'Probadores virtuales de gorras y accesorios con IA.',
      story: about.story || `En ${storeName} fusionamos diseño de autor, materiales de máxima calidad y tecnología de probador virtual con Inteligencia Artificial.`,
      mission: about.mission || 'Brindar a cada cliente la seguridad de elegir el producto perfecto antes de comprar con probador interactivo.',
      vision: about.vision || 'Ser la marca referente en diseño de accesorios y moda urbana con probadores virtuales.',
      quality: about.quality || 'Selección rigurosa de tejidos, costuras reforzadas de alta durabilidad y herrajes anatómicos.',
      foundedYear: about.foundedYear || '2024',
      location: location,
      email: email,
      phone: phone,
      statsHappyClients: about.statsHappyClients || '+2.500',
      statsTryonAccuracy: about.statsTryonAccuracy || '99.2%',
      statsFastShipping: about.statsFastShipping || '24-48 hs'
    },
    faq: {
      subtitle: 'Encontrá respuestas rápidas sobre el probador con IA, envíos, medios de pago y garantías.',
      items: [
        {
          id: 'faq-1',
          cat: 'ia',
          q: '¿Cómo funciona el probador virtual con Inteligencia Artificial?',
          a: `En ${storeName} utilizamos visión computacional para calibrar el tamaño, ángulo e iluminación de la prenda en tu rostro. Podés subir una foto o usar tu cámara en vivo y probarte cualquier modelo al instante.`
        },
        {
          id: 'faq-2',
          cat: 'ia',
          q: '¿Mis fotos quedan guardadas o son privadas?',
          a: 'Tu privacidad es absoluta. Tu foto se procesa de forma efímera en la memoria de la sesión y se destruye inmediatamente después.'
        },
        {
          id: 'faq-3',
          cat: 'envios',
          q: '¿Cuánto tarda en llegar mi pedido y cuánto cuesta el envío?',
          a: 'Para CABA y Gran Buenos Aires las entregas se realizan entre 24 y 48 horas hábiles. Para el resto del país, entre 3 y 5 días hábiles.'
        },
        {
          id: 'faq-4',
          cat: 'pagos',
          q: '¿Cuáles son los medios de pago aceptados?',
          a: 'Aceptamos tarjetas de crédito, débito y dinero en cuenta a través de Mercado Pago.'
        },
        {
          id: 'faq-5',
          cat: 'garantia',
          q: '¿Qué hago si el producto no me queda como esperaba?',
          a: 'Contás con 30 días corridos desde que recibís tu pedido para solicitar cambio o devolución.'
        }
      ]
    },
    envios: {
      freeShippingThreshold: 40000,
      freeShippingBanner: '¡Envío Gratis disponible! En compras superiores a $40.000 a cualquier punto del país.',
      standardTitle: 'Envío Estándar Nacional',
      standardTime: '3 a 5 días hábiles',
      standardCarrier: 'Andreani / Correo Argentino con seguimiento en tiempo real directo a tu puerta o sucursal.',
      expressTitle: 'Express CABA y GBA',
      expressTime: '24 a 48 hs hábiles',
      expressDesc: 'Servicio de mensajería prioritario para compras realizadas de Lunes a Viernes antes de las 13:00 hs.',
      pickupTitle: 'Retiro en Sucursal / Showroom',
      pickupTime: 'Gratis / Inmediato',
      pickupAddress: location,
      packagingTitle: 'Embalaje Protector Reforzado',
      packagingDesc: 'Despachamos cada pedido en cajas rígidas con soporte anatómico interno.'
    },
    cambios: {
      daysGuarantee: 30,
      bannerTitle: '30 Días Corridos de Garantía Sin Preguntas',
      bannerDesc: 'Tenés hasta 30 días posteriores a la fecha de recepción para solicitar un cambio de producto.',
      step1Title: 'Contactanos',
      step1Desc: `Escribinos por WhatsApp al ${phone} o a ${email}.`,
      step2Title: 'Despachá el Paquete',
      step2Desc: 'Te enviamos una etiqueta prepaga para que dejes el paquete en la sucursal más cercana.',
      step3Title: 'Recibí o Reintegrá',
      step3Desc: 'Una vez verificado el paquete, despachamos el nuevo modelo o te reintegramos el monto.',
      cond1: 'El producto debe estar nuevo, sin uso, sin perfumes ni marcas.',
      cond2: 'Conservar la etiqueta original colocada y el empaque rígido.',
      cond3: 'Presentar el número de orden o comprobante de compra digital.',
      whatsappNumber: phone
    },
    contacto: {
      whatsapp: phone,
      whatsappDesc: 'Respuesta rápida (menos de 15 min)',
      email: email,
      emailDesc: 'Para consultas generales, pedidos especiales o soporte de compra',
      hoursTitle: 'Horarios de Atención',
      hoursDesc: 'Lunes a Sábados de 9:00 a 20:00 hs',
      locationTitle: 'Punto de Entrega & Showroom',
      locationDesc: location,
      headerTitle: 'Contactanos',
      headerSubtitle: 'Estamos disponibles para resolver tus dudas sobre el catálogo y el probador con IA.'
    },
    terminos: {
      lastUpdated: 'Enero 2026',
      art1Title: '1. Aceptación de los Términos',
      art1Body: `Al acceder a ${storeName}, el usuario acepta los presentes Términos y Condiciones.`,
      art2Title: '2. Uso del Probador Virtual con IA',
      art2Body: 'El probador virtual es una herramienta orientativa basada en modelos de Inteligencia Artificial para estimar el calce visual de accesorios.',
      art3Title: '3. Precios y Moneda',
      art3Body: 'Todos los precios publicados en el catálogo están expresados en pesos argentinos (ARS).',
      art4Title: '4. Jurisdicción y Ley Aplicable',
      art4Body: 'Los presentes Términos y Condiciones se rigen por las leyes de la República Argentina.'
    },
    privacidad: {
      art1Title: '1. Privacidad en el Probador Virtual',
      art1Body: 'Las imágenes se procesan de forma efímera en la memoria volátil de la sesión y no se almacenan permanentemente.',
      art2Title: '2. Seguridad de Pagos',
      art2Body: 'Las transacciones se procesan de forma cifrada a través de pasarelas de pago certificadas.',
      art3Title: '3. Derechos del Titular',
      art3Body: `Conforme a la Ley N° 25.326, podés solicitar la actualización o eliminación de tus datos escribiendo a ${email}.`
    }
  };
}

function getStoreSections(storeId) {
  const store = getStoreById(storeId) || getStoreById('principal') || { ...defaultPrincipal };
  const defaults = getDefaultSectionsForStore(store);
  const saved = store.sections || {};

  return {
    home: { ...defaults.home, ...(saved.home || {}) },
    about: { ...defaults.about, ...(store.about || {}), ...(saved.about || {}) },
    faq: { ...defaults.faq, ...(saved.faq || {}) },
    envios: { ...defaults.envios, ...(saved.envios || {}) },
    cambios: { ...defaults.cambios, ...(saved.cambios || {}) },
    contacto: { ...defaults.contacto, ...(saved.contacto || {}) },
    terminos: { ...defaults.terminos, ...(saved.terminos || {}) },
    privacidad: { ...defaults.privacidad, ...(saved.privacidad || {}) }
  };
}

function updateStoreSections(storeId, sectionKey, sectionData) {
  const store = getStoreById(storeId);
  if (!store) throw new Error('Tienda no encontrada');

  const currentSections = getStoreSections(storeId);
  let updatedSections = { ...currentSections };

  if (sectionKey && sectionData) {
    updatedSections[sectionKey] = {
      ...(updatedSections[sectionKey] || {}),
      ...sectionData
    };
  } else if (typeof sectionData === 'object' && !sectionKey) {
    updatedSections = { ...updatedSections, ...sectionData };
  }

  const updates = { sections: updatedSections };
  if (updatedSections.about) {
    updates.about = updatedSections.about;
  }

  updateStore(store.id, updates);
  return updatedSections;
}

// ── VINCULACIÓN DE DUEÑOS ──

function findStoresByOwner({ email, uid }) {
  const stores = getAllStores();
  const cleanEmail = (email || '').toLowerCase().trim();
  return stores.filter(s => {
    if (uid && s.ownerUid === uid) return true;
    if (cleanEmail && s.ownerEmail && s.ownerEmail.toLowerCase() === cleanEmail) return true;
    return false;
  });
}

function linkStoreOwner({ storeId, uid, email, displayName, role }) {
  const store = getStoreById(storeId);
  if (store) {
    if (uid) store.ownerUid = uid;
    if (email) store.ownerEmail = email;
    updateStore(store.id, { ownerUid: uid, ownerEmail: email });
  }

  if (FirebaseDb && typeof FirebaseDb.saveStoreOwner === 'function') {
    FirebaseDb.saveStoreOwner({
      uid,
      email: email || '',
      displayName: displayName || (store ? store.name : ''),
      role: role || 'store_owner',
      storeId: store ? store.id : (storeId || ''),
      subdomain: store ? store.subdomain : '',
      createdAt: new Date().toISOString()
    }).catch(() => {});
  }
  return store;
}

function getDatabaseInfo() {
  const status = FirebaseDb && typeof FirebaseDb.getConnectionStatus === 'function'
    ? FirebaseDb.getConnectionStatus()
    : { isConnected: true, connectionError: null };

  return {
    provider: 'Firebase Firestore',
    edition: 'Enterprise Cloud DB',
    projectId: 'capfit-6689b',
    databaseId: '(default)',
    connected: status.isConnected,
    storageType: '100% Cloud Database (Firestore)',
    collections: ['stores', 'store_secrets', 'products', 'orders', 'ai_logs', 'store_owners'],
    multiTenant: true,
    statusText: status.isConnected ? 'Conectada y Operativa' : 'Verificando enlace'
  };
}

const StoreManager = {
  // Configuración y Cuotas
  PLAN_CONFIG,
  defaultPrincipal,
  getCurrentAiPeriod,
  getCurrentPeriod,
  getPlanDetails,
  getPlanConfig,
  getPlansCatalog,
  getPlanLimit,

  // Inicialización y Resolución
  init,
  ensureInitialized,
  sanitizePublicStore,
  getAllStores,
  getStoreById,
  getStoreBySubdomain,
  getStorePublic,
  resolveStoreFromRequest,

  // CRUD Tiendas y Secretos Aislados
  createOrUpdateStoreWithSecrets,
  createStore,
  updateStore,
  updateStorePlanAndQuota,
  deleteStore,
  verifyStoreCredentials,

  // Cuotas de IA
  checkAndDeductAiCredit,
  checkAndConsumeAiQuota,
  refundAiCredit,
  getAiQuotaStatus,

  // Catálogo y Órdenes
  readStoreProducts,
  fetchStoreProductsFromDb,
  writeStoreProducts,
  deleteStoreProduct,
  syncStoreProductsToFirestore,
  readStoreOrders,
  fetchStoreOrdersFromDb,
  writeStoreOrders,

  // Secciones
  getDefaultSectionsForStore,
  getStoreSections,
  updateStoreSections,

  // Cuentas y Diagnóstico
  findStoresByOwner,
  linkStoreOwner,
  getDatabaseInfo
};

module.exports = StoreManager;
module.exports.StoreManager = StoreManager;