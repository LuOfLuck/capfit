/**
 * Firebase Firestore & Storage Integration for CAPFIT Multi-Tenant SaaS
 */

const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocFromServer,
  increment
} = require('firebase/firestore');
const {
  getStorage,
  ref: storageRef,
  uploadBytes,
  getDownloadURL
} = require('firebase/storage');

const firebaseConfig = require('../firebase-applet-config.json');

// Initialize Firebase App, Firestore & Storage
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const storage = getStorage(app, firebaseConfig.storageBucket ? `gs://${firebaseConfig.storageBucket}` : undefined);

let isConnected = false;
let connectionError = null;

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    timestamp: new Date().toISOString()
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

/**
 * CRITICAL CONSTRAINT: Test connection to Firestore on boot using getDocFromServer
 */
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    isConnected = true;
    connectionError = null;
    console.log('✅ Conexión con Firebase Firestore verificada exitosamente.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (client is offline).');
    }
    if (error.code === 'permission-denied' || error.code === 'not-found') {
      isConnected = true;
      console.log('✅ Firebase Firestore accesible en la nube (código:', error.code, ').');
    } else {
      connectionError = error.message;
      console.warn('⚠️ Nota sobre Firebase Firestore:', error.message);
      if (!error.message.includes('offline')) {
        isConnected = true;
      }
    }
  }
}

// Iniciar prueba de conexión en arranque
testConnection();

// ── CRUD STORES ──
async function getStores() {
  try {
    const col = collection(db, 'stores');
    const snapshot = await getDocs(col);
    const stores = [];
    snapshot.forEach(docSnap => {
      stores.push({ id: docSnap.id, ...docSnap.data() });
    });
    return stores;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'stores');
    return [];
  }
}

async function getStoreByIdFromDb(storeId) {
  if (!storeId) return null;
  const cleanId = String(storeId).trim();
  try {
    const storeRef = doc(db, 'stores', cleanId);
    const snap = await getDoc(storeRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    const col = collection(db, 'stores');
    const q = query(col, where('subdomain', '==', cleanId));
    const qSnap = await getDocs(q);
    if (!qSnap.empty) {
      const d = qSnap.docs[0];
      return { id: d.id, ...d.data() };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `stores/${cleanId}`);
  }
  return null;
}

async function saveStore(store) {
  try {
    const storeRef = doc(db, 'stores', String(store.id));
    await setDoc(storeRef, store, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `stores/${store.id}`);
    return false;
  }
}

async function deleteStore(storeId) {
  try {
    const storeRef = doc(db, 'stores', String(storeId));
    await deleteDoc(storeRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `stores/${storeId}`);
    return false;
  }
}

async function incrementStoreAiUsage(storeId, currentPeriod, resetFirst = false) {
  if (!storeId) return false;
  try {
    const storeRef = doc(db, 'stores', String(storeId));
    if (resetFirst) {
      await updateDoc(storeRef, {
        aiPeriod: currentPeriod,
        aiGenerationsUsed: 1,
        updatedAt: new Date().toISOString()
      });
    } else {
      await updateDoc(storeRef, {
        aiPeriod: currentPeriod,
        aiGenerationsUsed: increment(1),
        updatedAt: new Date().toISOString()
      });
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `stores/${storeId}`);
    return false;
  }
}

// ── CRUD STORE SECRETS (PRIVATE PER-TENANT CREDENTIALS) ──
async function getStoreSecret(storeId) {
  if (!storeId) return null;
  const cleanId = String(storeId).trim();
  try {
    const secretRef = doc(db, 'store_secrets', cleanId);
    const snap = await getDoc(secretRef);
    return snap.exists() ? { storeId: snap.id, ...snap.data() } : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `store_secrets/${cleanId}`);
    return null;
  }
}

async function saveStoreSecret(storeId, secretData) {
  if (!storeId || !secretData) return false;
  const cleanId = String(storeId).trim();
  try {
    const secretRef = doc(db, 'store_secrets', cleanId);
    await setDoc(secretRef, {
      ...secretData,
      storeId: cleanId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `store_secrets/${cleanId}`);
    return false;
  }
}

// ── CRUD PRODUCTS ──
function sanitizeProduct(p, storeId) {
  const sId = storeId || p.storeId || 'principal';
  const prodId = String(p.id || `prod_${Date.now()}`);
  return {
    id: prodId,
    storeId: sId,
    nombre: String(p.nombre || 'Producto sin nombre'),
    tipo: String(p.tipo || p.categoria || 'gorra').toLowerCase(),
    categoria: String(p.categoria || p.tipo || 'gorra'),
    marca: String(p.marca || 'CAPFIT'),
    coleccion: String(p.coleccion || 'Urbana'),
    precio: Number(p.precio) || 0,
    precioAnterior: p.precioAnterior !== null && p.precioAnterior !== undefined && p.precioAnterior !== '' ? Number(p.precioAnterior) : null,
    stock: p.stock !== undefined && p.stock !== null ? Number(p.stock) : 10,
    badge: p.badge || null,
    tag: p.badge || p.tag || '',
    imgPreview: p.imgPreview || p.imgFrontal || p.imagen || '',
    imgFrontal: p.imgFrontal || p.imgPreview || p.imagen || '',
    imagen: p.imagen || p.imgPreview || p.imgFrontal || '',
    colores: Array.isArray(p.colores) ? p.colores : [{ name: 'Negro', hex: '#111111' }],
    color: (p.colores && p.colores[0] && p.colores[0].name) || p.color || 'Varios',
    detalles: Array.isArray(p.detalles) ? p.detalles : ['Calidad premium', 'Garantía oficial'],
    descripcion: Array.isArray(p.detalles) ? p.detalles.join(', ') : (p.descripcion || ''),
    esNuevo: Boolean(p.badge && p.badge.toLowerCase().includes('nuevo')),
    destacado: Boolean(p.rating && p.rating >= 4.9),
    rating: p.rating ? Number(p.rating) : 4.9,
    reviews: p.reviews ? Number(p.reviews) : 50,
    updatedAt: new Date().toISOString()
  };
}

async function getProductsByStore(storeId) {
  const sId = storeId || 'principal';
  try {
    // 1. Intentar leer de la subcolección dedicada de la tienda: /stores/{storeId}/products
    const subCol = collection(db, 'stores', sId, 'products');
    const snap = await getDocs(subCol);
    if (!snap.empty) {
      const items = [];
      snap.forEach(docSnap => {
        items.push(docSnap.data());
      });
      return items;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `stores/${sId}/products`);
  }

  try {
    // 2. Fallback: leer de la colección /products particionada por storeId
    const col = collection(db, 'products');
    const q = query(col, where('storeId', '==', sId));
    const snapshot = await getDocs(q);
    const products = [];
    snapshot.forEach(docSnap => {
      products.push(docSnap.data());
    });
    return products;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'products');
    return [];
  }
}

async function saveProduct(product, storeId) {
  const clean = sanitizeProduct(product, storeId);
  const sId = clean.storeId;
  const prodId = clean.id;
  const compositeId = `${sId}__${prodId}`;

  let okSub = false;
  let okGlobal = false;

  // 1. Guardar en la base de datos de cada cliente: /stores/{storeId}/products/{productId}
  try {
    const storeProdRef = doc(db, 'stores', sId, 'products', prodId);
    await setDoc(storeProdRef, clean, { merge: true });
    okSub = true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `stores/${sId}/products/${prodId}`);
  }

  // 2. Guardar en la colección global particionada: /products/{compositeId}
  try {
    const globalProdRef = doc(db, 'products', compositeId);
    await setDoc(globalProdRef, clean, { merge: true });
    okGlobal = true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `products/${compositeId}`);
  }

  return okSub || okGlobal;
}

async function deleteProduct(productId, storeId) {
  const sId = storeId || 'principal';
  const prodId = String(productId);
  const compositeId = `${sId}__${prodId}`;

  try {
    const storeProdRef = doc(db, 'stores', sId, 'products', prodId);
    await deleteDoc(storeProdRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `stores/${sId}/products/${prodId}`);
  }

  try {
    const globalProdRef = doc(db, 'products', compositeId);
    await deleteDoc(globalProdRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `products/${compositeId}`);
  }

  try {
    const legacyRef = doc(db, 'products', prodId);
    await deleteDoc(legacyRef);
  } catch (_) {}

  return true;
}

async function syncAllStoreProducts(storeId, products) {
  if (!Array.isArray(products) || products.length === 0) return { ok: true, count: 0 };
  const sId = storeId || 'principal';
  let synced = 0;
  for (const p of products) {
    try {
      const res = await saveProduct(p, sId);
      if (res) synced++;
    } catch (_) {}
  }
  return { ok: true, count: synced, total: products.length, storeId: sId };
}

// ── CRUD ORDERS (COMPOSITE TENANT ISOLATION & FULL FIELD FIDELITY) ──
function getCompositeOrderDocId(storeId, orderId) {
  const cleanStore = String(storeId || 'principal').trim();
  const cleanOrder = String(orderId || '').trim().replace(/\//g, '_');
  if (cleanOrder.startsWith(`${cleanStore}__`)) {
    return cleanOrder;
  }
  return `${cleanStore}__${cleanOrder}`;
}

function normalizeOrderForPersistence(order, fallbackStoreId = null) {
  const sId = String(order.storeId || fallbackStoreId || 'principal').trim();
  const orderId = String(order.id || `ORD-${Date.now()}`).trim();
  const nowIso = new Date().toISOString();
  const totalVal = Number(order.total !== undefined ? order.total : order.totalAmount) || 0;
  const shippingVal = Number(order.shipping !== undefined ? order.shipping : order.shippingCost) || 0;
  const subtotalVal = Number(order.subtotal) !== undefined && !isNaN(Number(order.subtotal))
    ? Number(order.subtotal)
    : Math.max(0, totalVal - shippingVal);

  return {
    ...order,
    id: orderId,
    storeId: sId,
    userId: order.userId !== undefined ? order.userId : null,
    buyerEmail: order.buyerEmail || (order.customer && order.customer.email) || '',
    isClaimed: Boolean(order.isClaimed || order.userId),
    customer: order.customer || {},
    items: Array.isArray(order.items) ? order.items : [],
    subtotal: subtotalVal,
    shipping: shippingVal,
    shippingCost: shippingVal,
    total: totalVal,
    totalAmount: totalVal,
    currency: order.currency || 'ARS',
    paymentMethod: order.paymentMethod || 'Mercado Pago',
    paymentStatus: order.paymentStatus || 'Pendiente',
    shippingStatus: order.shippingStatus || 'Por preparar',
    shippingTracking: order.shippingTracking || {
      carrier: 'Andreani',
      trackingCode: order.trackingCode || '',
      shippedAt: null
    },
    trackingCode: order.trackingCode || (order.shippingTracking && order.shippingTracking.trackingCode) || '',
    notes: order.notes || '',
    status: order.status || 'pending',
    mpPreferenceId: order.mpPreferenceId || null,
    mpPaymentId: order.mpPaymentId || null,
    externalReference: order.externalReference || `ord_${sId}_${orderId}`,
    processedWebhookIds: Array.isArray(order.processedWebhookIds) ? order.processedWebhookIds : [],
    date: order.date || order.createdAt || nowIso,
    createdAt: order.createdAt || order.date || nowIso,
    paidAt: order.paidAt || null,
    updatedAt: nowIso
  };
}

async function getOrdersByStore(storeId) {
  const sId = String(storeId || 'principal').trim();
  try {
    const col = collection(db, 'orders');
    const q = query(col, where('storeId', '==', sId));
    const snapshot = await getDocs(q);
    const ordersMap = new Map();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data && data.id) {
        ordersMap.set(String(data.id), data);
      }
    });
    const orders = Array.from(ordersMap.values());
    orders.sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0));
    return orders;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'orders');
    return [];
  }
}

async function getOrderById(storeId, orderId) {
  if (!orderId) return null;
  const sId = String(storeId || 'principal').trim();
  const compositeId = getCompositeOrderDocId(sId, orderId);

  try {
    // 1. Buscar primero por clave compuesta aislada por tienda
    const compositeRef = doc(db, 'orders', compositeId);
    const compositeSnap = await getDoc(compositeRef);
    if (compositeSnap.exists()) {
      const data = compositeSnap.data();
      if (!data.storeId || String(data.storeId).toLowerCase() === sId.toLowerCase()) {
        return data;
      }
    }

    // 2. Fallback para órdenes legacy guardadas por order.id directo
    const legacyRef = doc(db, 'orders', String(orderId).replace(/\//g, '_'));
    const legacySnap = await getDoc(legacyRef);
    if (legacySnap.exists()) {
      const data = legacySnap.data();
      if (!data.storeId || String(data.storeId).toLowerCase() === sId.toLowerCase()) {
        return data;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `orders/${compositeId}`);
  }
  return null;
}

async function getOrderByExternalReference(storeId, externalReference) {
  if (!externalReference) return null;
  const sId = String(storeId || 'principal').trim();
  try {
    const col = collection(db, 'orders');
    const q = query(col, where('storeId', '==', sId), where('externalReference', '==', String(externalReference)));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `orders?externalReference=${externalReference}`);
  }
  return null;
}

async function saveOrder(order, fallbackStoreId = null) {
  if (!order || !order.id) return false;
  const normalized = normalizeOrderForPersistence(order, fallbackStoreId);
  const compositeId = getCompositeOrderDocId(normalized.storeId, normalized.id);
  try {
    const orderRef = doc(db, 'orders', compositeId);
    await setDoc(orderRef, normalized, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `orders/${compositeId}`);
    return false;
  }
}

async function updateOrder(orderId, updates, storeId = null) {
  const sId = storeId || (updates && updates.storeId) || 'principal';
  const compositeId = getCompositeOrderDocId(sId, orderId);
  try {
    const orderRef = doc(db, 'orders', compositeId);
    await setDoc(orderRef, {
      ...updates,
      id: String(orderId),
      storeId: String(sId),
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${compositeId}`);
    return false;
  }
}

/**
 * Actualiza una orden de manera consistente e idempotente (para Webhooks y confirmaciones de pago)
 */
async function updateOrderIdempotent(storeId, orderId, updates, webhookEventKey = null) {
  const existing = await getOrderById(storeId, orderId);
  const baseOrder = existing || { id: orderId, storeId };
  const processedList = Array.isArray(baseOrder.processedWebhookIds) ? [...baseOrder.processedWebhookIds] : [];

  if (webhookEventKey && processedList.includes(String(webhookEventKey))) {
    return { ok: true, duplicate: true, order: baseOrder };
  }

  if (webhookEventKey) {
    processedList.push(String(webhookEventKey));
  }

  const merged = normalizeOrderForPersistence({
    ...baseOrder,
    ...updates,
    processedWebhookIds: processedList
  }, storeId);

  await saveOrder(merged, storeId);
  return { ok: true, duplicate: false, order: merged };
}

async function deleteOrder(orderId, storeId = 'principal') {
  const compositeId = getCompositeOrderDocId(storeId, orderId);
  try {
    await deleteDoc(doc(db, 'orders', compositeId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `orders/${compositeId}`);
    return false;
  }
}

// ── FIREBASE STORAGE: MULTI-TENANT PRODUCT IMAGES ──
/**
 * Sube una imagen de producto al bucket de Firebase Storage bajo:
 * stores/{storeId}/products/{filename}
 */
async function uploadStoreProductImage({ storeId, filename, buffer, contentType = 'image/webp' }) {
  const cleanStoreId = String(storeId || 'principal').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanFilename = String(filename || `prod_${Date.now()}.webp`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `stores/${cleanStoreId}/products/${cleanFilename}`;

  try {
    const fileRef = storageRef(storage, storagePath);
    const snapshot = await uploadBytes(fileRef, buffer, {
      contentType,
      customMetadata: {
        storeId: cleanStoreId,
        uploadedAt: new Date().toISOString()
      }
    });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return {
      ok: true,
      storage: 'firebase_storage',
      path: storagePath,
      url: downloadUrl
    };
  } catch (err) {
    console.warn(`[FirebaseStorage] Aviso al subir ${storagePath} a Firebase Storage (${err.message}).`);
    return {
      ok: false,
      error: err.message,
      path: storagePath
    };
  }
}

// ── AUDIT AI LOGS ──
async function logAITryOn(logData) {
  try {
    const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const logRef = doc(db, 'ai_logs', logId);
    await setDoc(logRef, {
      id: logId,
      ...logData,
      timestamp: new Date().toISOString()
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'ai_logs');
    return false;
  }
}

// ── STORE OWNERS (ADMIN USERS) ──
async function saveStoreOwner(owner) {
  if (!owner || (!owner.uid && !owner.email)) return false;
  const docId = String(owner.uid || owner.email).trim().replace(/\//g, '_');
  try {
    const ref = doc(db, 'store_owners', docId);
    await setDoc(ref, {
      ...owner,
      uid: owner.uid || docId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `store_owners/${docId}`);
    return false;
  }
}

async function getStoreOwner(uid) {
  try {
    const ref = doc(db, 'store_owners', uid);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `store_owners/${uid}`);
    return null;
  }
}

module.exports = {
  db,
  app,
  storage,
  testConnection,
  handleFirestoreError,
  isConnected: () => isConnected,
  getConnectionStatus: () => ({
    isConnected,
    connectionError,
    databaseId: firebaseConfig.firestoreDatabaseId,
    storageBucket: firebaseConfig.storageBucket
  }),
  getStores,
  getStoreByIdFromDb,
  saveStore,
  deleteStore,
  incrementStoreAiUsage,
  getStoreSecret,
  saveStoreSecret,
  getProductsByStore,
  saveProduct,
  deleteProduct,
  syncAllStoreProducts,
  getCompositeOrderDocId,
  normalizeOrderForPersistence,
  getOrdersByStore,
  getOrderById,
  getOrderByExternalReference,
  saveOrder,
  updateOrder,
  updateOrderIdempotent,
  deleteOrder,
  uploadStoreProductImage,
  logAITryOn,
  saveStoreOwner,
  getStoreOwner
};
