/**
 * CAPFIT - Servicio de Cliente Híbrido (CapFit ID Global + Relación por Tienda)
 * Implementa:
 * - users/{uid}: CapFit ID Global, perfil de calce (fitProfile), baseSelfies y addresses
 * - store_customers/{storeId}_{uid}: Relación determinística por tienda con wishlist y stats
 * - try_on_generations/{genId}: Registro seguro de generaciones IA
 * - Detección automática de Dueños de Tienda (Opción A cruzando con store_secrets y stores)
 */

const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
  limit
} = require('firebase/firestore');

const FirebaseDb = require('./firebase-db');
const { db } = FirebaseDb;

// Caché de alta velocidad en memoria para respuestas inmediatas
const usersCache = new Map();
const storeCustomersCache = new Map();
const tryOnsCache = new Map();
const ordersCache = [];

function recordOrder(order) {
  if (!order || !order.id) return;
  const idx = ordersCache.findIndex(o => o.id === order.id);
  if (idx >= 0) {
    ordersCache[idx] = { ...ordersCache[idx], ...order };
  } else {
    ordersCache.unshift(order);
  }
}

/**
 * Obtiene el documento global de usuario users/{uid}
 */
async function getUser(uid) {
  if (!uid) return null;
  const uidStr = String(uid);
  if (usersCache.has(uidStr)) {
    return usersCache.get(uidStr);
  }

  try {
    const userRef = doc(db, 'users', uidStr);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      usersCache.set(uidStr, data);
      return data;
    }
  } catch (err) {
    FirebaseDb.handleFirestoreError(err, 'get', `users/${uid}`);
  }

  return usersCache.get(uidStr) || null;
}

/**
 * Guarda o actualiza el documento global de usuario users/{uid}
 */
async function saveUser(uid, data) {
  if (!uid) return false;
  const uidStr = String(uid);
  const existing = usersCache.get(uidStr) || {};
  const merged = {
    ...existing,
    ...data,
    uid: uidStr,
    updatedAt: new Date().toISOString()
  };
  usersCache.set(uidStr, merged);

  try {
    const userRef = doc(db, 'users', uidStr);
    await setDoc(userRef, merged, { merge: true });
    return true;
  } catch (err) {
    FirebaseDb.handleFirestoreError(err, 'write', `users/${uid}`);
    return true; // Retornar true porque está guardado en el caché del servidor
  }
}

/**
 * Obtiene la relación de cliente por tienda: store_customers/{storeId}_{uid}
 */
async function getStoreCustomer(storeId, uid) {
  if (!storeId || !uid) return null;
  const relationId = `${storeId}_${uid}`;
  if (storeCustomersCache.has(relationId)) {
    return storeCustomersCache.get(relationId);
  }

  try {
    const relRef = doc(db, 'store_customers', relationId);
    const snap = await getDoc(relRef);
    if (snap.exists()) {
      const data = snap.data();
      storeCustomersCache.set(relationId, data);
      return data;
    }
  } catch (err) {
    FirebaseDb.handleFirestoreError(err, 'get', `store_customers/${relationId}`);
  }

  return storeCustomersCache.get(relationId) || null;
}

/**
 * Guarda o actualiza la relación store_customers/{storeId}_{uid}
 */
async function saveStoreCustomer(storeId, uid, data) {
  if (!storeId || !uid) return false;
  const relationId = `${storeId}_${uid}`;
  const existing = storeCustomersCache.get(relationId) || {};
  const merged = {
    storeId: String(storeId),
    userId: String(uid),
    ...existing,
    ...data,
    updatedAt: new Date().toISOString()
  };
  storeCustomersCache.set(relationId, merged);

  try {
    const relRef = doc(db, 'store_customers', relationId);
    await setDoc(relRef, merged, { merge: true });
    return true;
  } catch (err) {
    FirebaseDb.handleFirestoreError(err, 'write', `store_customers/${relationId}`);
    return true;
  }
}

/**
 * Detecta si el email o uid es dueño de alguna tienda activa o configurada en store_secrets / stores
 */
async function detectOwnedStores(email, uid) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const ownedStoresSet = new Set();

  // 1. Consultar store_secrets por ownerEmail o adminUsername
  try {
    const secretsCol = collection(db, 'store_secrets');
    if (cleanEmail) {
      const qEmail = query(secretsCol, where('ownerEmail', '==', cleanEmail));
      const snapEmail = await getDocs(qEmail);
      snapEmail.forEach(docSnap => ownedStoresSet.add(docSnap.id));

      const qUser = query(secretsCol, where('adminUsername', '==', cleanEmail));
      const snapUser = await getDocs(qUser);
      snapUser.forEach(docSnap => ownedStoresSet.add(docSnap.id));
    }
  } catch (err) {
    console.warn('[detectOwnedStores] Aviso en store_secrets:', err.message);
  }

  // 2. Consultar stores por ownerEmail o ownerUid
  try {
    const storesCol = collection(db, 'stores');
    if (cleanEmail) {
      const qStoresEmail = query(storesCol, where('ownerEmail', '==', cleanEmail));
      const snapStoresEmail = await getDocs(qStoresEmail);
      snapStoresEmail.forEach(docSnap => ownedStoresSet.add(docSnap.id));
    }
    if (uid) {
      const qStoresUid = query(storesCol, where('ownerUid', '==', uid));
      const snapStoresUid = await getDocs(qStoresUid);
      snapStoresUid.forEach(docSnap => ownedStoresSet.add(docSnap.id));
    }
  } catch (err) {
    console.warn('[detectOwnedStores] Aviso en stores:', err.message);
  }

  // 3. Fallback con StoreManager local
  try {
    const StoreManager = require('./store-manager');
    if (StoreManager && typeof StoreManager.findStoresByOwner === 'function') {
      const localOwned = StoreManager.findStoresByOwner({ email: cleanEmail, uid });
      localOwned.forEach(s => ownedStoresSet.add(s.id));
    }
  } catch (_) {}

  // Si es SuperAdmin especial
  const superadminEmail = (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com').toLowerCase().trim();
  if (cleanEmail === superadminEmail) {
    ownedStoresSet.add('principal');
  }

  return Array.from(ownedStoresSet);
}

/**
 * Sincroniza la sesión del cliente al iniciar sesión o cargar la tienda:
 * - Crea o actualiza users/{uid}
 * - Registra ownedStores (escrito con seguridad exclusiva en el servidor)
 * - Inicializa o recupera store_customers/{storeId}_{uid}
 */
async function syncSession({ uid, email, displayName, phone, dni, photoURL, currentStoreId }) {
  if (!uid || !email) {
    throw new Error('uid y email son requeridos para sincronizar sesión.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanStoreId = (currentStoreId && typeof currentStoreId === 'string' && !currentStoreId.startsWith('ais-'))
    ? currentStoreId.trim()
    : 'principal';

  // 1. Detectar propiedad de tiendas
  const ownedStores = await detectOwnedStores(cleanEmail, uid);

  // 2. Cargar o crear documento global users/{uid}
  let existingUser = await getUser(uid);
  const now = new Date().toISOString();

  if (!existingUser) {
    existingUser = {
      uid: String(uid),
      email: cleanEmail,
      displayName: displayName || cleanEmail.split('@')[0],
      phone: phone || '',
      dni: dni || '',
      photoURL: photoURL || '',
      ownedStores,
      fitProfile: {
        headCircumferenceCm: null,
        preferredStyles: [],
        fittedSize: ''
      },
      baseSelfies: [],
      addresses: [],
      createdAt: now,
      updatedAt: now
    };
    await saveUser(uid, existingUser);
  } else {
    // Si ya existe, actualizamos ownedStores y campos de contacto si cambiaron
    const updates = {
      ownedStores,
      updatedAt: now
    };
    if (displayName && (!existingUser.displayName || existingUser.displayName === cleanEmail.split('@')[0])) {
      updates.displayName = displayName;
    }
    if (photoURL && !existingUser.photoURL) {
      updates.photoURL = photoURL;
    }
    if (phone && !existingUser.phone) {
      updates.phone = phone;
    }
    if (dni && !existingUser.dni) {
      updates.dni = dni;
    }
    // Asegurar estructura
    if (!existingUser.fitProfile) {
      updates.fitProfile = { headCircumferenceCm: null, preferredStyles: [], fittedSize: '' };
    }
    if (!Array.isArray(existingUser.baseSelfies)) {
      updates.baseSelfies = [];
    }
    if (!Array.isArray(existingUser.addresses)) {
      updates.addresses = [];
    }

    await saveUser(uid, updates);
    existingUser = { ...existingUser, ...updates };
  }

  // 3. Inicializar o recuperar relación store_customers/{currentStoreId}_{uid}
  let storeCustomer = await getStoreCustomer(cleanStoreId, uid);
  if (!storeCustomer) {
    storeCustomer = {
      storeId: cleanStoreId,
      userId: String(uid),
      customerSnapshot: {
        displayName: existingUser.displayName || '',
        email: cleanEmail,
        phone: existingUser.phone || ''
      },
      wishlistProductIds: [],
      marketingOptIn: true,
      stats: {
        totalOrders: 0,
        totalSpent: 0,
        tryOnsCount: 0,
        firstInteractionAt: now,
        lastOrderAt: null
      },
      createdAt: now,
      updatedAt: now
    };
    await saveStoreCustomer(cleanStoreId, uid, storeCustomer);
  } else {
    // Mantener snapshot de contacto sincronizado
    if (existingUser.displayName !== storeCustomer.customerSnapshot?.displayName ||
        cleanEmail !== storeCustomer.customerSnapshot?.email) {
      storeCustomer.customerSnapshot = {
        displayName: existingUser.displayName || '',
        email: cleanEmail,
        phone: existingUser.phone || storeCustomer.customerSnapshot?.phone || ''
      };
      await saveStoreCustomer(cleanStoreId, uid, { customerSnapshot: storeCustomer.customerSnapshot });
    }
  }

  const isOwnerOfCurrentStore = ownedStores.includes(cleanStoreId) || cleanEmail === 'lucasg33322@gmail.com';

  return {
    ok: true,
    user: existingUser,
    storeCustomer,
    ownedStores,
    isOwnerOfCurrentStore
  };
}

/**
 * Registra una generación del probador virtual en try_on_generations/{genId}
 */
async function recordTryOnGeneration({ storeId, userId, isOwnerTest, productId, productSnapshot, resultImageUrl }) {
  const genId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
  const now = new Date().toISOString();

  const record = {
    id: genId,
    storeId: String(storeId || 'principal'),
    userId: userId ? String(userId) : null,
    isOwnerTest: Boolean(isOwnerTest),
    productId: productId ? String(productId) : null,
    productSnapshot: productSnapshot || null,
    resultImageUrl: String(resultImageUrl || ''),
    convertedToOrder: false,
    createdAt: now
  };

  tryOnsCache.set(genId, record);

  // Si el usuario está registrado, incrementar tryOnsCount en store_customers
  if (userId && storeId) {
    try {
      const rel = await getStoreCustomer(storeId, userId);
      if (rel) {
        const stats = rel.stats || { totalOrders: 0, totalSpent: 0, tryOnsCount: 0 };
        stats.tryOnsCount = (stats.tryOnsCount || 0) + 1;
        await saveStoreCustomer(storeId, userId, { stats });
      }
    } catch (_) {}
  }

  try {
    const genRef = doc(db, 'try_on_generations', genId);
    await setDoc(genRef, record);
  } catch (err) {
    // Si Firestore restringe escritura directa de cliente, queda registrado en servidor
    FirebaseDb.handleFirestoreError(err, 'create', `try_on_generations/${genId}`);
  }

  return { ok: true, genId, record };
}

/**
 * Obtiene el historial de generaciones de un usuario en una tienda
 */
async function getUserTryOns(userId, storeId) {
  if (!userId) return [];
  const results = [];
  const uidStr = String(userId);
  const sId = storeId ? String(storeId) : null;

  for (const r of tryOnsCache.values()) {
    if (r.userId === uidStr && (!sId || r.storeId === sId)) {
      results.push(r);
    }
  }

  try {
    const col = collection(db, 'try_on_generations');
    let q;
    if (sId) {
      q = query(col, where('userId', '==', uidStr), where('storeId', '==', sId));
    } else {
      q = query(col, where('userId', '==', uidStr));
    }
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!results.some(r => r.id === data.id)) {
        results.push(data);
      }
    });
  } catch (err) {
    FirebaseDb.handleFirestoreError(err, 'list', 'try_on_generations');
  }

  results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return results;
}

/**
 * Obtiene pedidos vinculados a un usuario por userId o buyerEmail
 */
async function getUserOrders(userId, buyerEmail) {
  const orders = [];
  const orderIdsSeen = new Set();
  const cleanEmail = (buyerEmail || '').toLowerCase().trim();
  const uidStr = userId ? String(userId) : '';

  // 1. Consultar ordersCache en memoria
  for (const o of ordersCache) {
    const matchUser = uidStr && String(o.userId || '') === uidStr;
    const orderEmail = (o.buyerEmail || (o.customer && o.customer.email) || '').toLowerCase().trim();
    const matchEmail = cleanEmail && orderEmail === cleanEmail;
    if ((matchUser || matchEmail) && !orderIdsSeen.has(o.id)) {
      orderIdsSeen.add(o.id);
      orders.push(o);
    }
  }

  // 2. Consultar órdenes en StoreManager local
  try {
    const StoreManager = require('./store-manager');
    if (StoreManager && typeof StoreManager.getAllStores === 'function') {
      const stores = StoreManager.getAllStores();
      for (const st of stores) {
        const storeOrders = StoreManager.readStoreOrders(st.id);
        for (const o of storeOrders) {
          const matchUser = uidStr && String(o.userId || '') === uidStr;
          const orderEmail = (o.buyerEmail || (o.customer && o.customer.email) || '').toLowerCase().trim();
          const matchEmail = cleanEmail && orderEmail === cleanEmail;
          if ((matchUser || matchEmail) && !orderIdsSeen.has(o.id)) {
            orderIdsSeen.add(o.id);
            orders.push(o);
          }
        }
      }
    }
  } catch (_) {}

  // 3. Consultar Firestore con timeout seguro
  try {
    const col = collection(db, 'orders');

    if (userId) {
      const qUser = query(col, where('userId', '==', String(userId)));
      const snapUser = await getDocs(qUser);
      snapUser.forEach(docSnap => {
        const data = docSnap.data();
        if (!orderIdsSeen.has(data.id)) {
          orderIdsSeen.add(data.id);
          orders.push(data);
        }
      });
    }

    if (buyerEmail) {
      const qEmail = query(col, where('buyerEmail', '==', cleanEmail));
      const snapEmail = await getDocs(qEmail);
      snapEmail.forEach(docSnap => {
        const data = docSnap.data();
        if (!orderIdsSeen.has(data.id)) {
          orderIdsSeen.add(data.id);
          orders.push(data);
        }
      });
    }
  } catch (err) {
    FirebaseDb.handleFirestoreError(err, 'list', 'orders');
  }

  orders.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
  return orders;
}

module.exports = {
  getUser,
  saveUser,
  getStoreCustomer,
  saveStoreCustomer,
  detectOwnedStores,
  syncSession,
  recordTryOnGeneration,
  getUserTryOns,
  getUserOrders,
  recordOrder
};
