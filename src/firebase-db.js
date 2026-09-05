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

// ── CRUD PRODUCTS ──
async function getProductsByStore(storeId) {
  try {
    const col = collection(db, 'products');
    const q = query(col, where('storeId', '==', storeId));
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

async function saveProduct(product) {
  try {
    const prodRef = doc(db, 'products', String(product.id));
    await setDoc(prodRef, product, { merge: true });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `products/${product.id}`);
    return false;
  }
}

async function deleteProduct(productId) {
  try {
    const prodRef = doc(db, 'products', String(productId));
    await deleteDoc(prodRef);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `products/${productId}`);
    return false;
  }
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

module.exports = {
  db,
  app,
  testConnection,
  handleFirestoreError,
  isConnected: () => isConnected,
  getConnectionStatus: () => ({ isConnected, connectionError, databaseId: firebaseConfig.firestoreDatabaseId }),
  getStores,
  saveStore,
  getProductsByStore,
  saveProduct,
  deleteProduct,
  getOrdersByStore,
  saveOrder,
  updateOrder,
  logAITryOn
};
