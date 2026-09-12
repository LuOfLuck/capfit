/**
 * js/core/firebase-client.js
 * Inicialización y helpers de Firebase Auth y Firestore para el frontend (<150 líneas).
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAFz9zUuRPgy4n-tYP-3BxwmXldMBMUmhA",
  authDomain: "capfit-6689b.firebaseapp.com",
  projectId: "capfit-6689b",
  storageBucket: "capfit-6689b.firebasestorage.app",
  messagingSenderId: "278406793068",
  appId: "1:278406793068:web:da02f07bf8b13afdeb1549",
  measurementId: "G-RJFGW1349J"
};

let authInstance = null;
let currentFirebaseUser = null;
const authStateListeners = [];

async function initFirebaseClient() {
  if (authInstance) return authInstance;
  try {
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
    const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');

    const apps = getApps();
    const app = apps.length ? apps[0] : initializeApp(FIREBASE_CONFIG);
    authInstance = getAuth(app);

    onAuthStateChanged(authInstance, (user) => {
      currentFirebaseUser = user;
      authStateListeners.forEach(cb => {
        try { cb(user); } catch (e) { console.error('Auth listener error:', e); }
      });
    });

    return authInstance;
  } catch (err) {
    console.warn('[FirebaseClient] Error inicializando SDK:', err.message);
    return null;
  }
}

async function signInWithGoogle() {
  const auth = await initFirebaseClient();
  if (!auth) throw new Error('No se pudo inicializar Firebase Auth SDK.');
  const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  currentFirebaseUser = result.user;
  return result.user;
}

async function signInWithEmail(email, password) {
  const auth = await initFirebaseClient();
  if (!auth) throw new Error('No se pudo inicializar Firebase Auth SDK.');
  const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
  const result = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
  currentFirebaseUser = result.user;
  return result.user;
}

async function signOutUser() {
  const auth = await initFirebaseClient();
  if (auth) {
    const { signOut } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
    await signOut(auth);
  }
  currentFirebaseUser = null;
  sessionStorage.removeItem('capfit_session');
  sessionStorage.removeItem('capfit_role');
  sessionStorage.removeItem('capfit_store_id');
}

window.FirebaseClient = {
  init: initFirebaseClient,
  signInWithGoogle,
  signInWithEmail,
  signOutUser,
  getCurrentUser: () => currentFirebaseUser,
  onAuthStateChanged: (cb) => {
    authStateListeners.push(cb);
    if (currentFirebaseUser) cb(currentFirebaseUser);
  }
};

initFirebaseClient().catch(() => {});
