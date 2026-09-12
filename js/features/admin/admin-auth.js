/**
 * js/features/admin/admin-auth.js
 * Autenticación de dueños de tienda y superadmin vía Firebase Auth (<150 líneas).
 */

const AdminAuth = (() => {
  const SESSION_KEY = 'capfit_admin_auth_token';
  const ROLE_KEY = 'capfit_admin_role';
  const STORE_ID_KEY = 'capfit_admin_store_id';
  const STORE_NAME_KEY = 'capfit_admin_store_name';
  const SUBDOMAIN_KEY = 'capfit_admin_subdomain';

  function isLoggedIn() {
    return !!(sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem('capfit_session'));
  }

  function getSession() {
    return {
      token: sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem('capfit_session'),
      role: sessionStorage.getItem(ROLE_KEY) || sessionStorage.getItem('capfit_role') || 'store_owner',
      storeId: sessionStorage.getItem(STORE_ID_KEY) || sessionStorage.getItem('capfit_store_id') || 'principal',
      storeName: sessionStorage.getItem(STORE_NAME_KEY) || sessionStorage.getItem('capfit_store_name') || 'Mi Tienda',
      subdomain: sessionStorage.getItem(SUBDOMAIN_KEY) || sessionStorage.getItem('capfit_store_subdomain') || 'tienda1',
      email: sessionStorage.getItem('capfit_user_email') || '',
      name: sessionStorage.getItem('capfit_user_name') || ''
    };
  }

  function setSession(data) {
    if (data.token) {
      sessionStorage.setItem(SESSION_KEY, data.token);
      sessionStorage.setItem('capfit_session', data.token);
    }
    if (data.role) sessionStorage.setItem(ROLE_KEY, data.role);
    if (data.storeId) sessionStorage.setItem(STORE_ID_KEY, data.storeId);
    if (data.storeName) sessionStorage.setItem(STORE_NAME_KEY, data.storeName);
    if (data.subdomain) sessionStorage.setItem(SUBDOMAIN_KEY, data.subdomain);
    if (data.email) sessionStorage.setItem('capfit_user_email', data.email);
    if (data.name) sessionStorage.setItem('capfit_user_name', data.name);
  }

  async function loginWithGoogle() {
    if (!window.FirebaseClient && !window.CapfitAuth) {
      throw new Error('Módulo de autenticación no disponible.');
    }
    const authClient = window.CapfitAuth || window.FirebaseClient;
    const user = await authClient.signInWithGoogle();
    const targetStore = (window.Store && Store.getCurrentStoreId) ? Store.getCurrentStoreId() : null;

    if (window.CapfitAuth && CapfitAuth.verifySessionWithBackend) {
      const verifyRes = await CapfitAuth.verifySessionWithBackend(user, targetStore);
      if (verifyRes.verified) {
        setSession({
          token: verifyRes.token,
          role: verifyRes.role,
          storeId: verifyRes.storeId,
          storeName: verifyRes.storeName,
          subdomain: verifyRes.subdomain,
          email: user.email,
          name: user.displayName
        });
        return { ok: true, user };
      }
      return { ok: false, needRegisterStore: true, user };
    }

    return { ok: true, user };
  }

  async function loginWithEmail(email, password) {
    const authClient = window.CapfitAuth || window.FirebaseClient;
    const user = await authClient.signInWithEmail(email, password);
    const targetStore = (window.Store && Store.getCurrentStoreId) ? Store.getCurrentStoreId() : null;

    if (window.CapfitAuth && CapfitAuth.verifySessionWithBackend) {
      const verifyRes = await CapfitAuth.verifySessionWithBackend(user, targetStore);
      if (verifyRes.verified) {
        setSession({
          token: verifyRes.token,
          role: verifyRes.role,
          storeId: verifyRes.storeId,
          storeName: verifyRes.storeName,
          subdomain: verifyRes.subdomain,
          email: user.email,
          name: user.displayName
        });
      }
    }
    return user;
  }

  async function logout() {
    const authClient = window.CapfitAuth || window.FirebaseClient;
    if (authClient && authClient.signOutUser) {
      await authClient.signOutUser();
    }
    sessionStorage.clear();
    window.location.reload();
  }

  return {
    isLoggedIn,
    getSession,
    setSession,
    loginWithGoogle,
    loginWithEmail,
    logout
  };
})();

window.AdminAuth = AdminAuth;
