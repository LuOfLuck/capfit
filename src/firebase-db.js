/**
 * Firebase Firestore Database Integration for CAPFIT Multi-Tenant SaaS
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
  getDocFromServer
} = require('firebase/firestore');

const firebaseConfig = require('../firebase-applet-config.json');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
    // Si la colección de test no existe o falla permisos pero responde, se considera alcanzable
    if (error.code === 'permission-denied' || error.code === 'not-found') {
      isConnected = true;
      console.log('✅ Firebase Firestore accesible en la nube (código:', error.code, ').');
    } else {
      connectionError = error.message;
      console.warn('⚠️ Nota sobre Firebase Firestore:', error.message);
      // Mantener en true si no es offline para permitir operaciones
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
      stores.push(docSnap.data());
    });
    return stores;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'stores');
    return [];
  }
}

async function saveStore(store) {
  try {
    const storeRef = doc(db, 'stores', store.id);
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

  // 1. Eliminar de la subcolección de la tienda
  try {
    const storeProdRef = doc(db, 'stores', sId, 'products', prodId);
    await deleteDoc(storeProdRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `stores/${sId}/products/${prodId}`);
  }

  // 2. Eliminar de la colección global
  try {
    const globalProdRef = doc(db, 'products', compositeId);
    await deleteDoc(globalProdRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `products/${compositeId}`);
  }

  // 3. Eliminar de legacy /products/{prodId}
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

// ── CRUD ORDERS ──
async function getOrdersByStore(storeId) {
  try {
    const col = collection(db, 'orders');
    const q = query(col, where('storeId', '==', storeId));
    const snapshot = await getDocs(q);
    const orders = [];
    snapshot.forEach(docSnap => {
      orders.push(docSnap.data());
    });
    return orders;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'orders');
    return [];
  }
}

async function saveOrder(order) {
  try {
    const orderRef = doc(db, 'orders', String(order.id));
    await setDoc(orderRef, order, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `orders/${order.id}`);
    return false;
  }
}

async function updateOrder(orderId, updates) {
  try {
    const orderRef = doc(db, 'orders', String(orderId));
    await updateDoc(orderRef, updates);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    return false;
  }
}

async function deleteOrder(orderId) {
  try {
    const orderRef = doc(db, 'orders', String(orderId));
    await deleteDoc(orderRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `orders/${orderId}`);
    return false;
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
  try {
    const ref = doc(db, 'store_owners', owner.uid);
    await setDoc(ref, {
      ...owner,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `store_owners/${owner.uid}`);
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
  testConnection,
  handleFirestoreError,
  isConnected: () => isConnected,
  getConnectionStatus: () => ({ isConnected, connectionError, databaseId: firebaseConfig.firestoreDatabaseId }),
  getStores,
  saveStore,
  deleteStore,
  getProductsByStore,
  saveProduct,
  deleteProduct,
  syncAllStoreProducts,
  getOrdersByStore,
  saveOrder,
  updateOrder,
  deleteOrder,
  logAITryOn,
  saveStoreOwner,
  getStoreOwner
};
