/**
 * CAPFIT - Firebase Authentication & Store Owner Identity Service
 * Connects directly to Firebase Auth SDK (Google & Email/Password)
 * Separates Store Owners (Admins) from regular shoppers (Customers).
 */

(function() {
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDigsQcUkAGElI_lPTgq4VpfKFFyTE8NCw",
    authDomain: "applied-sunlight-dgtt6.firebaseapp.com",
    projectId: "applied-sunlight-dgtt6",
    storageBucket: "applied-sunlight-dgtt6.firebasestorage.app",
    messagingSenderId: "766976387991",
    appId: "1:766976387991:web:4027135384a5562a2db2d2"
  };

  let authInstance = null;
  let currentFirebaseUser = null;
  let authInitialized = false;
  let initPromise = null;
  const authStateListeners = [];

  // Subdominio del portal de dueños
  function isAccountPortalDomain() {
    const host = (window.location.hostname || '').toLowerCase();
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    const path = window.location.pathname || '';

    return (
      host === 'account.capfit.store' ||
      host.startsWith('account.') ||
      search.includes('account=true') ||
      search.includes('subdomain=account') ||
      hash === '#account' ||
      hash === '#portal-duenos' ||
      path === '/account'
    );
  }

  // Inicializar SDK modular de Firebase desde CDN oficial
  async function initAuth() {
    if (authInitialized && authInstance) return authInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
        const {
          getAuth,
          onAuthStateChanged
        } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');

        const apps = getApps();
        const app = apps.length ? apps[0] : initializeApp(FIREBASE_CONFIG);
        authInstance = getAuth(app);

        onAuthStateChanged(authInstance, (user) => {
          currentFirebaseUser = user;
          authStateListeners.forEach(cb => {
            try { cb(user); } catch (e) { console.error('Auth listener error:', e); }
          });
        });

        authInitialized = true;
        console.log('✅ Firebase Auth inicializado para CAPFIT Store Owners.');
        return authInstance;
      } catch (err) {
        console.warn('Nota: Carga de Firebase Auth SDK:', err.message);
        authInitialized = false;
        return null;
      }
    })();

    return initPromise;
  }

  // Iniciar sesión con Google (Popup)
  async function signInWithGoogle() {
    const auth = await initAuth();
    if (!auth) throw new Error('No se pudo inicializar Firebase Auth SDK.');

    const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      currentFirebaseUser = result.user;
      return result.user;
    } catch (err) {
      console.error('Error Google Sign-In:', err);
      if (err.code === 'auth/popup-blocked') {
        throw new Error('El navegador bloqueó la ventana emergente de Google. Permití ventanas emergentes o abrí la app en una pestaña nueva.');
      }
      if (err.code === 'auth/popup-closed-by-user') {
        throw new Error('Inicio de sesión cancelado.');
      }
      throw err;
    }
  }

  // Iniciar sesión con Email y Contraseña
  async function signInWithEmail(email, password) {
    const auth = await initAuth();
    if (!auth) throw new Error('No se pudo inicializar Firebase Auth SDK.');

    const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');

    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      currentFirebaseUser = result.user;
      return result.user;
    } catch (err) {
      console.error('Error Email Sign-In:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        throw new Error('Email o contraseña incorrectos.');
      }
      if (err.code === 'auth/invalid-email') {
        throw new Error('El formato del correo electrónico no es válido.');
      }
      if (err.code === 'auth/operation-not-allowed') {
        throw new Error('El proveedor Email/Contraseña requiere activación en Firebase Console. Podés utilizar "Continuar con Google" de manera inmediata.');
      }
      throw err;
    }
  }

  // Registro de nuevo Dueño con Email y Contraseña
  async function registerWithEmail(email, password) {
    const auth = await initAuth();
    if (!auth) throw new Error('No se pudo inicializar Firebase Auth SDK.');

    const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');

    try {
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
      currentFirebaseUser = result.user;
      return result.user;
    } catch (err) {
      console.error('Error Email Register:', err);
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('Este correo ya se encuentra registrado. Iniciá sesión o probá con otro correo.');
      }
      if (err.code === 'auth/weak-password') {
        throw new Error('La contraseña debe tener al menos 6 caracteres.');
      }
      if (err.code === 'auth/operation-not-allowed') {
        throw new Error('El proveedor Email/Contraseña requiere activación en Firebase Console. Podés utilizar "Continuar con Google" de manera inmediata.');
      }
      throw err;
    }
  }

  // Cerrar sesión
  async function signOutUser() {
    const auth = await initAuth();
    if (auth) {
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
      await signOut(auth);
    }
    currentFirebaseUser = null;
    sessionStorage.removeItem('capfit_session');
    sessionStorage.removeItem('capfit_role');
    sessionStorage.removeItem('capfit_store_id');
    sessionStorage.removeItem('capfit_store_subdomain');
    sessionStorage.removeItem('capfit_store_name');
    sessionStorage.removeItem('capfit_user_email');
    sessionStorage.removeItem('capfit_user_name');
  }

  // Verificar credenciales de Firebase Auth contra el backend de CAPFIT
  async function verifySessionWithBackend(firebaseUser) {
    if (!firebaseUser) throw new Error('Usuario no autenticado en Firebase.');

    const res = await fetch('/api/admin/auth/firebase-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || '',
        photoURL: firebaseUser.photoURL || ''
      })
    });

    const data = await res.json();
    if (data.ok) {
      // Guardar sesión autorizada de administrador
      sessionStorage.setItem('capfit_session', data.token);
      sessionStorage.setItem('capfit_role', data.role);
      sessionStorage.setItem('capfit_store_id', data.storeId);
      sessionStorage.setItem('capfit_store_subdomain', data.subdomain || '');
      sessionStorage.setItem('capfit_store_name', data.storeName || '');
      sessionStorage.setItem('capfit_user_email', firebaseUser.email);
      sessionStorage.setItem('capfit_user_name', data.user?.displayName || firebaseUser.displayName || '');
      return { verified: true, ...data };
    }

    // Usuario autenticado pero sin tienda asociada
    if (data.code === 'NO_STORE_REGISTERED') {
      return { verified: false, needRegisterStore: true, user: data.user || firebaseUser };
    }

    throw new Error(data.error || 'No se pudo verificar la sesión de administrador.');
  }

  // Registrar nueva tienda asociada al usuario de Firebase Auth
  async function registerStoreForOwner({ storeName, subdomain, plan, tagline, firebaseUser }) {
    const user = firebaseUser || currentFirebaseUser;
    if (!user) throw new Error('Debes autenticarte primero para registrar tu tienda.');

    const res = await fetch('/api/admin/auth/firebase-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || storeName,
        storeName,
        subdomain,
        plan: plan || 'Starter',
        tagline: tagline || `Tienda oficial ${storeName}`
      })
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo crear la tienda.');
    }

    // Guardar sesión autorizada
    sessionStorage.setItem('capfit_session', data.token);
    sessionStorage.setItem('capfit_role', 'store_owner');
    sessionStorage.setItem('capfit_store_id', data.storeId);
    sessionStorage.setItem('capfit_store_subdomain', data.subdomain);
    sessionStorage.setItem('capfit_store_name', data.storeName);
    sessionStorage.setItem('capfit_user_email', user.email);
    sessionStorage.setItem('capfit_user_name', user.displayName || data.storeName);

    return data;
  }

  // Verificar si hay sesión de Backoffice activa
  function isBackofficeAuthenticated() {
    const token = sessionStorage.getItem('capfit_session');
    const role = sessionStorage.getItem('capfit_role');
    return Boolean(token && (role === 'store_owner' || role === 'superadmin'));
  }

  function getStoredAdminSession() {
    return {
      token: sessionStorage.getItem('capfit_session'),
      role: sessionStorage.getItem('capfit_role'),
      storeId: sessionStorage.getItem('capfit_store_id'),
      subdomain: sessionStorage.getItem('capfit_store_subdomain'),
      storeName: sessionStorage.getItem('capfit_store_name'),
      email: sessionStorage.getItem('capfit_user_email'),
      name: sessionStorage.getItem('capfit_user_name')
    };
  }

  // Exponer API global
  window.CapfitAuth = {
    init: initAuth,
    isAccountPortalDomain,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    signOutUser,
    verifySessionWithBackend,
    registerStoreForOwner,
    isBackofficeAuthenticated,
    getStoredAdminSession,
    getCurrentUser: () => currentFirebaseUser,
    onAuthStateChanged: (cb) => {
      authStateListeners.push(cb);
      if (currentFirebaseUser) cb(currentFirebaseUser);
    }
  };

  // Autoejecutar inicialización silenciosa
  initAuth().catch(() => {});
})();
