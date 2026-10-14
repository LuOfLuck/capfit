/**
 * CAPFIT - Gestor Multi-Tienda, Planes y Control de Cuotas de IA (Opción A: store_secrets)
 * Separa los metadatos públicos (colección `stores`) de las credenciales administrativas (`store_secrets`).
 */

const { db } = require('./firebase-db');
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} = require('firebase/firestore');

// Planes oficiales actualizados (Octubre 2026) con enrutamiento de modelo ($0.020 vs $0.024)
const PLAN_CONFIG = {
  Free: {
    aiMonthlyLimit: 20,
    modelTier: 'standard',
    primaryModel: 'openai/gpt-image-2/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.020,
    showCapfitBranding: true
  },
  Starter: {
    aiMonthlyLimit: 150,
    modelTier: 'standard',
    primaryModel: 'openai/gpt-image-2/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.020,
    showCapfitBranding: true
  },
  Growth: {
    aiMonthlyLimit: 350,
    modelTier: 'hd',
    primaryModel: 'openai/gpt-image-2.5/sunburst/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.024,
    showCapfitBranding: false
  },
  Pro: {
    aiMonthlyLimit: 1000,
    modelTier: 'hd',
    primaryModel: 'openai/gpt-image-2.5/sunburst/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.024,
    showCapfitBranding: false
  },
  Enterprise: {
    aiMonthlyLimit: 4000,
    modelTier: 'hd',
    primaryModel: 'openai/gpt-image-2.5/sunburst/edit',
    fallbackModel: 'openai/gpt-image-2/edit',
    unitCostUsd: 0.024,
    showCapfitBranding: false
  }
};

function getCurrentAiPeriod() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getPlanConfig(planName) {
  return PLAN_CONFIG[planName] || PLAN_CONFIG.Starter;
}

/**
 * Sanitiza un objeto de tienda para garantizar que nunca exponga adminUsername ni adminPassword.
 */
function sanitizePublicStore(storeData) {
  if (!storeData) return null;
  const { adminUsername, adminPassword, ...publicFields } = storeData;
  return publicFields;
}

/**
 * Obtiene los datos públicos de una tienda por su ID o subdominio.
 */
async function getStorePublic(storeIdentifier) {
  if (!storeIdentifier) return null;

  const directRef = doc(db, 'stores', storeIdentifier);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) {
    return sanitizePublicStore({ id: directSnap.id, ...directSnap.data() });
  }

  const storesCol = collection(db, 'stores');
  const q = query(storesCol, where('subdomain', '==', storeIdentifier));
  const querySnap = await getDocs(q);
  if (!querySnap.empty) {
    const docSnap = querySnap.docs[0];
    return sanitizePublicStore({ id: docSnap.id, ...docSnap.data() });
  }

  return null;
}

/**
 * Crea o actualiza una tienda separando sus datos públicos (`stores/{id}`)
 * de sus credenciales administrativas (`store_secrets/{id}`).
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
    plan = 'Starter',
    aiMonthlyLimit,
    active = true
  } = storeInput;

  const storeId = id || subdomain;
  if (!storeId) {
    throw new Error('Se requiere un id o subdomain para crear la tienda.');
  }

  const planDefaults = getPlanConfig(plan);
  const resolvedLimit =
    typeof aiMonthlyLimit === 'number' ? aiMonthlyLimit : planDefaults.aiMonthlyLimit;

  // 1. Documento público en `stores/{storeId}` (SIN credenciales)
  const publicStoreData = {
    id: storeId,
    subdomain: subdomain || storeId,
    name: name || storeId,
    tagline,
    about,
    plan,
    aiMonthlyLimit: resolvedLimit,
    aiGenerationsUsed: 0,
    aiPeriod: getCurrentAiPeriod(),
    active: Boolean(active),
    createdAt: serverTimestamp()
  };

  await setDoc(doc(db, 'stores', storeId), publicStoreData, { merge: true });

  // 2. Documento privado en `store_secrets/{storeId}` (credenciales aisladas)
  if (adminUsername || adminPassword) {
    const secretData = {
      storeId,
      adminUsername: adminUsername || `admin_${storeId}`,
      adminPassword: adminPassword || '',
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, 'store_secrets', storeId), secretData, { merge: true });
  }

  return publicStoreData;
}

/**
 * Verifica las credenciales de un administrador de tienda contra `store_secrets/{storeId}`
 * desde el servidor sin exponer el documento al navegador.
 */
async function verifyStoreCredentials(storeId, username, password) {
  if (!storeId || !password) return { valid: false, reason: 'Credenciales incompletas' };

  // Verificación de SuperAdmin maestro
  const masterPassword = process.env.ADMIN_PASSWORD;
  if (masterPassword && password === masterPassword && (!username || username === 'superadmin')) {
    return { valid: true, role: 'superadmin', storeId: '*' };
  }

  const secretRef = doc(db, 'store_secrets', storeId);
  const secretSnap = await getDoc(secretRef);
  if (!secretSnap.exists()) {
    return { valid: false, reason: 'No existen credenciales configuradas para esta tienda' };
  }

  const secret = secretSnap.data();
  const usernameMatches = !username || secret.adminUsername === username;
  const passwordMatches = secret.adminPassword === password;

  if (usernameMatches && passwordMatches) {
    return { valid: true, role: 'tenant_admin', storeId };
  }

  return { valid: false, reason: 'Usuario o contraseña incorrectos' };
}

/**
 * Verifica si la tienda tiene cuota disponible en el período actual y devuelve
 * la configuración del modelo IA según su plan ($0.020 Estándar vs $0.024 HD).
 */
async function checkAndConsumeAiQuota(storeId) {
  const storeRef = doc(db, 'stores', storeId);
  const storeSnap = await getDoc(storeRef);

  if (!storeSnap.exists()) {
    return { allowed: false, status: 404, error: 'Tienda no encontrada' };
  }

  const store = storeSnap.data();
  if (store.active === false) {
    return { allowed: false, status: 403, error: 'La tienda se encuentra desactivada' };
  }

  const currentPeriod = getCurrentAiPeriod();
  let used = Number(store.aiGenerationsUsed || 0);
  const limit = Number(store.aiMonthlyLimit ?? getPlanConfig(store.plan).aiMonthlyLimit);

  // Reinicio automático al cambiar de mes (YYYY-MM)
  if (store.aiPeriod !== currentPeriod) {
    used = 0;
    await updateDoc(storeRef, {
      aiPeriod: currentPeriod,
      aiGenerationsUsed: 0
    });
  }

  if (used >= limit) {
    return {
      allowed: false,
      status: 429,
      error: 'Cuota mensual de Probador Virtual agotada para esta tienda',
      quota: { used, limit, period: currentPeriod, plan: store.plan }
    };
  }

  const nextUsed = used + 1;
  await updateDoc(storeRef, {
    aiGenerationsUsed: nextUsed,
    aiPeriod: currentPeriod
  });

  const planConfig = getPlanConfig(store.plan);

  return {
    allowed: true,
    status: 200,
    store: sanitizePublicStore(store),
    modelRouting: {
      plan: store.plan || 'Starter',
      modelTier: planConfig.modelTier,
      primaryModel: planConfig.primaryModel,
      fallbackModel: planConfig.fallbackModel,
      showCapfitBranding: planConfig.showCapfitBranding
    },
    quota: {
      used: nextUsed,
      limit,
      remaining: Math.max(0, limit - nextUsed),
      period: currentPeriod
    }
  };
}

module.exports = {
  PLAN_CONFIG,
  getCurrentAiPeriod,
  getPlanConfig,
  sanitizePublicStore,
  getStorePublic,
  createOrUpdateStoreWithSecrets,
  verifyStoreCredentials,
  checkAndConsumeAiQuota
};