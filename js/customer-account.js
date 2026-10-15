/**
 * CAPFIT - Sistema de Usuario Comprador Híbrido (CapFit ID Global + Relación por Tienda)
 * Reconocimiento Automático de Dueño de Tienda (Opción A: store_secrets)
 * Vanilla JS modular (ES6 compatible) manipulando el DOM de forma eficiente y segura.
 */

(function() {
  'use strict';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPrice(num) {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(num || 0);
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return isoStr;
    }
  }

  function calculateCapSize(cm) {
    const val = Number(cm);
    if (!val || isNaN(val)) return '';
    if (val < 55) return 'S (53-55 cm)';
    if (val <= 57.5) return 'M (56-57 cm)';
    if (val <= 59.5) return 'L (58-59 cm)';
    return 'XL (60-62 cm)';
  }

  // Estado reactivo en memoria
  let _currentUser = null;
  let _userProfile = null;
  let _storeCustomer = null;
  let _ownedStores = [];
  let _isOwnerOfCurrentStore = false;
  let _activeTab = 'fitProfile'; // 'fitProfile' | 'selfies' | 'addresses' | 'orders' | 'wishlist'
  let _isSyncing = false;

  function getCurrentStoreId() {
    if (window.Store && typeof window.Store.getCurrentStoreId === 'function') {
      const id = window.Store.getCurrentStoreId();
      if (id && !id.startsWith('ais-')) return id;
    }
    return 'principal';
  }

  async function getCustomerAuthHeaders(extra = {}) {
    const headers = { ...extra };
    if (_currentUser && typeof _currentUser.getIdToken === 'function') {
      try {
        const idToken = await _currentUser.getIdToken();
        if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
      } catch (_) {}
    }
    return headers;
  }

  /**
   * Sincroniza la sesión con el backend /api/customer/sync-session
   */
  async function syncCustomerSession(firebaseUser) {
    if (!firebaseUser || !firebaseUser.uid) {
      _currentUser = null;
      _userProfile = null;
      _storeCustomer = null;
      _ownedStores = [];
      _isOwnerOfCurrentStore = false;
      updateHeaderAuthUI();
      updateTryOnQuickSelfies();
      return null;
    }

    _currentUser = firebaseUser;
    _isSyncing = true;

    try {
      const currentStoreId = getCurrentStoreId();
      const idToken = typeof firebaseUser.getIdToken === 'function' ? await firebaseUser.getIdToken() : '';
      const res = await fetch('/api/customer/sync-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Store-Id': currentStoreId,
          ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          idToken,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || '',
          currentStoreId
        })
      });

      const data = await res.json();
      if (data && data.ok) {
        _userProfile = data.user;
        _storeCustomer = data.storeCustomer;
        _ownedStores = data.ownedStores || [];
        _isOwnerOfCurrentStore = Boolean(data.isOwnerOfCurrentStore);

        // Reconocimiento Automático de Dueño de Tienda (Opción A):
        // Conectar sesión administrativa usando el ID Token firmado criptográficamente
        if ((_isOwnerOfCurrentStore || _ownedStores.length > 0) && idToken) {
          const activeStore = _isOwnerOfCurrentStore ? currentStoreId : (_ownedStores[0] || 'principal');
          sessionStorage.setItem('capfit_session', idToken);
          sessionStorage.setItem('capfit_admin_auth_token', idToken);
          sessionStorage.setItem('capfit_role', 'store_owner');
          sessionStorage.setItem('capfit_store_id', activeStore);
          sessionStorage.setItem('capfit_user_email', _userProfile.email);
          sessionStorage.setItem('capfit_user_name', _userProfile.displayName || '');
        }

        console.log('✅ CapFit ID sincronizado con éxito:', _userProfile.email, {
          ownedStores: _ownedStores,
          isOwnerOfCurrentStore: _isOwnerOfCurrentStore
        });
      }
    } catch (err) {
      console.warn('[CapfitCustomer] Error sincronizando sesión:', err.message);
    } finally {
      _isSyncing = false;
      updateHeaderAuthUI();
      updateTryOnQuickSelfies();
      refreshAccountModalIfOpen();
    }

    return _userProfile;
  }

  /**
   * Actualiza el botón de usuario en la barra de navegación superior
   */
  function updateHeaderAuthUI() {
    const avatarEl = document.getElementById('nav-account-avatar');
    const labelEl = document.getElementById('nav-account-label');
    const ownerBadgeEl = document.getElementById('nav-owner-badge');

    if (!_currentUser || !_userProfile) {
      if (avatarEl) {
        avatarEl.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        `;
      }
      if (labelEl) labelEl.textContent = 'Mi Cuenta';
      if (ownerBadgeEl) ownerBadgeEl.style.display = 'none';
      return;
    }

    const name = _userProfile.displayName || _currentUser.displayName || _currentUser.email.split('@')[0];
    const initial = (name.charAt(0) || 'U').toUpperCase();

    if (avatarEl) {
      if (_userProfile.photoURL) {
        avatarEl.innerHTML = `<img src="${escapeHtml(_userProfile.photoURL)}" alt="${escapeHtml(name)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;">`;
      } else {
        avatarEl.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#0f172a;color:#ffffff;border-radius:50%;font-size:0.75rem;font-weight:700;">${initial}</span>`;
      }
    }

    if (labelEl) {
      const shortName = name.split(' ')[0];
      labelEl.textContent = shortName;
    }

    // Badge de dueño de tienda si posee tiendas
    if (ownerBadgeEl) {
      if (_isOwnerOfCurrentStore || _ownedStores.length > 0) {
        ownerBadgeEl.style.display = 'inline-flex';
        ownerBadgeEl.title = 'Dueño de Tienda verificado';
      } else {
        ownerBadgeEl.style.display = 'none';
      }
    }
  }

  /**
   * Muestra la barra de selfies guardadas en la vista del probador (#view-probador)
   */
  function updateTryOnQuickSelfies() {
    const bar = document.getElementById('tryon-capfit-selfies-bar');
    const container = document.getElementById('tryon-selfies-chips');
    if (!bar || !container) return;

    const selfies = (_userProfile && Array.isArray(_userProfile.baseSelfies)) ? _userProfile.baseSelfies : [];
    if (!_currentUser || selfies.length === 0) {
      bar.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    bar.style.display = 'block';
    container.innerHTML = selfies.map((s, idx) => `
      <button class="tryon-selfie-chip ${s.isDefault ? 'active-default' : ''}" onclick="window.CapfitCustomer.useSelfieInTryOn('${s.id}')" title="Usar esta foto para probar">
        <img src="${escapeHtml(s.imageUrl)}" alt="Selfie ${idx + 1}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">
        <span>${s.isDefault ? 'Principal' : `Selfie #${idx + 1}`}</span>
      </button>
    `).join('') + `
      <button class="tryon-selfie-chip add-chip" onclick="window.CapfitCustomer.openAccountModal('selfies')" title="Gestionar mis fotos en CapFit ID">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Gestionar</span>
      </button>
    `;
  }

  /**
   * Aplica una selfie guardada directamente en el lienzo del probador
   */
  async function useSelfieInTryOn(selfieId) {
    if (!_userProfile || !Array.isArray(_userProfile.baseSelfies)) return;
    const selfie = _userProfile.baseSelfies.find(s => s.id === selfieId);
    if (!selfie || !selfie.imageUrl) return;

    if (window.navigateToView) window.navigateToView('probador');

    // Cargar la imagen en el canvas del probador
    const ri = document.getElementById('result-img');
    const ph = document.getElementById('cam-placeholder');
    const vf = document.getElementById('video-feed');
    const overlay = document.getElementById('loading-overlay');
    const runBtn = document.getElementById('btn-run-tryon');
    const canvas = document.getElementById('output-canvas');

    if (vf) vf.style.display = 'none';
    if (ph) ph.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    // Cargar imagen en memoria global del probador
    window.userPhoto = selfie.imageUrl;
    window.fotoUsuarioData = selfie.imageUrl;

    if (canvas) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        canvas.width = img.naturalWidth || 600;
        canvas.height = img.naturalHeight || 800;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.style.display = 'block';
      };
      img.src = selfie.imageUrl;
    }

    if (runBtn) {
      runBtn.disabled = false;
      runBtn.style.opacity = '1';
    }

    if (window.setStep) window.setStep(3);
    if (window.showToast) window.showToast('✨ Foto de tu CapFit ID cargada para probar');
  }

  /**
   * Abre el Modal interactivo de CapFit ID
   */
  function openAccountModal(initialTab = null) {
    if (initialTab) _activeTab = initialTab;

    let modal = document.getElementById('capfit-account-modal');
    if (!modal) {
      createAccountModalDom();
      modal = document.getElementById('capfit-account-modal');
    }

    renderAccountModalContent();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeAccountModal() {
    const modal = document.getElementById('capfit-account-modal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function refreshAccountModalIfOpen() {
    const modal = document.getElementById('capfit-account-modal');
    if (modal && modal.classList.contains('active')) {
      renderAccountModalContent();
    }
  }

  function createAccountModalDom() {
    const backdrop = document.createElement('div');
    backdrop.id = 'capfit-account-modal';
    backdrop.className = 'capfit-modal-backdrop';
    backdrop.innerHTML = `
      <div class="capfit-modal-card" role="dialog" aria-modal="true">
        <button class="capfit-modal-close" onclick="window.CapfitCustomer.closeAccountModal()" aria-label="Cerrar modal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <div id="capfit-modal-inner" class="capfit-modal-inner"></div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAccountModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.classList.contains('active')) {
        closeAccountModal();
      }
    });

    document.body.appendChild(backdrop);
  }

  /**
   * Renderiza el contenido del modal según el estado de autenticación
   */
  function renderAccountModalContent() {
    const container = document.getElementById('capfit-modal-inner');
    if (!container) return;

    if (!_currentUser) {
      renderUnauthModal(container);
    } else {
      renderAuthModal(container);
    }
  }

  /**
   * Vista de Inicio de Sesión / Registro (Unauthenticated)
   */
  function renderUnauthModal(container) {
    container.innerHTML = `
      <div class="capfit-auth-box">
        <div class="capfit-id-badge">
          <span class="capfit-id-logo">CAP<span>FIT</span> ID</span>
          <span class="capfit-id-tag">Pase Global</span>
        </div>

        <h2 class="capfit-modal-title">Tu identidad única para todas las tiendas</h2>
        <p class="capfit-modal-sub">
          Guardá tu talle de gorra, tus selfies del probador con IA y tus direcciones para comprar y probar en 1 solo clic.
        </p>

        <div class="capfit-auth-tabs">
          <button id="auth-tab-login" class="capfit-auth-tab active" onclick="window.CapfitCustomer.switchAuthMode('login')">Iniciar Sesión</button>
          <button id="auth-tab-register" class="capfit-auth-tab" onclick="window.CapfitCustomer.switchAuthMode('register')">Crear Cuenta</button>
        </div>

        <div class="capfit-auth-actions">
          <button class="btn-google-auth" onclick="window.CapfitCustomer.handleGoogleAuth()">
            <svg viewBox="0 0 24 24" class="google-icon" style="width:18px;height:18px">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Continuar con Google</span>
          </button>

          <div class="capfit-divider">
            <span>o con tu correo electrónico</span>
          </div>

          <form id="capfit-email-form" onsubmit="window.CapfitCustomer.handleEmailAuth(event)">
            <div class="capfit-form-field">
              <label for="auth-email">Correo Electrónico</label>
              <input type="email" id="auth-email" placeholder="tu@email.com" required autocomplete="email">
            </div>

            <div class="capfit-form-field">
              <label for="auth-password">Contraseña</label>
              <input type="password" id="auth-password" placeholder="••••••••" required autocomplete="current-password">
            </div>

            <div id="auth-extra-fields" style="display:none;">
              <div class="capfit-form-field">
                <label for="auth-name">Nombre y Apellido</label>
                <input type="text" id="auth-name" placeholder="Ej: Lucas Gómez" autocomplete="name">
              </div>
            </div>

            <div id="auth-error-box" class="capfit-error-alert" style="display:none;"></div>

            <button type="submit" id="btn-submit-auth" class="btn-capfit-primary">
              Iniciar Sesión
            </button>
          </form>

          <div class="capfit-auth-footer">
            <span class="auth-helper-text">
              ¿Sos dueño de una tienda? Iniciá sesión con tu email de administrador para acceder a tu panel automáticamente.
            </span>
          </div>
        </div>
      </div>
    `;
  }

  let _authMode = 'login';
  function switchAuthMode(mode) {
    _authMode = mode;
    const loginTab = document.getElementById('auth-tab-login');
    const registerTab = document.getElementById('auth-tab-register');
    const extraFields = document.getElementById('auth-extra-fields');
    const submitBtn = document.getElementById('btn-submit-auth');
    const errorBox = document.getElementById('auth-error-box');

    if (errorBox) errorBox.style.display = 'none';

    if (mode === 'register') {
      if (loginTab) loginTab.classList.remove('active');
      if (registerTab) registerTab.classList.add('active');
      if (extraFields) extraFields.style.display = 'block';
      if (submitBtn) submitBtn.textContent = 'Crear mi CapFit ID';
    } else {
      if (loginTab) loginTab.classList.add('active');
      if (registerTab) registerTab.classList.remove('active');
      if (extraFields) extraFields.style.display = 'none';
      if (submitBtn) submitBtn.textContent = 'Iniciar Sesión';
    }
  }

  async function handleGoogleAuth() {
    const errorBox = document.getElementById('auth-error-box');
    if (errorBox) errorBox.style.display = 'none';

    try {
      if (!window.CapfitAuth || typeof window.CapfitAuth.signInWithGoogle !== 'function') {
        throw new Error('Servicio de autenticación no inicializado.');
      }
      const user = await window.CapfitAuth.signInWithGoogle();
      await syncCustomerSession(user);
      if (window.showToast) window.showToast(`¡Bienvenido, ${user.displayName || 'Comprador'}!`);
      closeAccountModal();
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = err.message || 'Error al iniciar sesión con Google';
        errorBox.style.display = 'block';
      }
    }
  }

  async function handleEmailAuth(e) {
    e.preventDefault();
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    const nameEl = document.getElementById('auth-name');
    const errorBox = document.getElementById('auth-error-box');
    const submitBtn = document.getElementById('btn-submit-auth');

    const email = emailEl ? emailEl.value.trim() : '';
    const pass = passEl ? passEl.value : '';
    const name = nameEl ? nameEl.value.trim() : '';

    if (!email || !pass) return;

    if (errorBox) errorBox.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Procesando...';
    }

    try {
      if (!window.CapfitAuth) throw new Error('Servicio de autenticación no inicializado.');

      let user;
      if (_authMode === 'register') {
        user = await window.CapfitAuth.registerWithEmail(email, pass);
        if (name && user) {
          try {
            const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
            await updateProfile(user, { displayName: name });
          } catch (_) {}
        }
      } else {
        user = await window.CapfitAuth.signInWithEmail(email, pass);
      }

      await syncCustomerSession(user);
      if (window.showToast) window.showToast(`¡Hola, ${user.displayName || email}!`);
      closeAccountModal();
    } catch (err) {
      if (errorBox) {
        errorBox.textContent = err.message || 'Error en la autenticación';
        errorBox.style.display = 'block';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = _authMode === 'register' ? 'Crear mi CapFit ID' : 'Iniciar Sesión';
      }
    }
  }

  /**
   * Vista de Usuario Autenticado (Authenticated CapFit ID Profile)
   */
  function renderAuthModal(container) {
    const user = _userProfile || {};
    const name = user.displayName || _currentUser.displayName || _currentUser.email.split('@')[0];
    const email = user.email || _currentUser.email;
    const phone = user.phone || '';
    const dni = user.dni || '';
    const fitProfile = user.fitProfile || { headCircumferenceCm: '', preferredStyles: [], fittedSize: '' };
    const selfies = Array.isArray(user.baseSelfies) ? user.baseSelfies : [];
    const addresses = Array.isArray(user.addresses) ? user.addresses : [];
    const wishlistIds = (_storeCustomer && Array.isArray(_storeCustomer.wishlistProductIds)) ? _storeCustomer.wishlistProductIds : [];
    const stats = (_storeCustomer && _storeCustomer.stats) ? _storeCustomer.stats : { totalOrders: 0, totalSpent: 0, tryOnsCount: 0 };

    const isOwner = _isOwnerOfCurrentStore || _ownedStores.length > 0;

    container.innerHTML = `
      <div class="capfit-profile-layout">
        <!-- ── HEADER PERFIL ── -->
        <div class="capfit-profile-header">
          <div class="capfit-user-info">
            <div class="capfit-user-avatar">
              ${user.photoURL ? `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(name)}">` : `<span>${escapeHtml(name.charAt(0).toUpperCase())}</span>`}
            </div>
            <div>
              <div class="capfit-user-row">
                <h3 class="capfit-user-name">${escapeHtml(name)}</h3>
                <span class="capfit-global-tag">CapFit ID</span>
              </div>
              <p class="capfit-user-email">${escapeHtml(email)}</p>
            </div>
          </div>

          ${isOwner ? `
            <div class="capfit-owner-banner">
              <div class="owner-badge-text">
                <span class="crown-icon">👑</span>
                <span><strong>Dueño de Tienda</strong> (Reconocimiento Automático)</span>
              </div>
              <button class="btn-owner-backoffice" onclick="window.CapfitCustomer.goToBackoffice()">
                Ir al Panel de Dueño →
              </button>
            </div>
          ` : ''}
        </div>

        <!-- ── NAVEGACIÓN DE PESTAÑAS ── -->
        <div class="capfit-profile-nav">
          <button class="profile-nav-tab ${_activeTab === 'fitProfile' ? 'active' : ''}" onclick="window.CapfitCustomer.setTab('fitProfile')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>Mis Medidas</span>
          </button>
          <button class="profile-nav-tab ${_activeTab === 'selfies' ? 'active' : ''}" onclick="window.CapfitCustomer.setTab('selfies')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span>Mis Selfies (${selfies.length})</span>
          </button>
          <button class="profile-nav-tab ${_activeTab === 'addresses' ? 'active' : ''}" onclick="window.CapfitCustomer.setTab('addresses')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Direcciones (${addresses.length})</span>
          </button>
          <button class="profile-nav-tab ${_activeTab === 'orders' ? 'active' : ''}" onclick="window.CapfitCustomer.setTab('orders')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <span>Mis Pedidos (${stats.totalOrders || 0})</span>
          </button>
          <button class="profile-nav-tab ${_activeTab === 'wishlist' ? 'active' : ''}" onclick="window.CapfitCustomer.setTab('wishlist')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span>Favoritos (${wishlistIds.length})</span>
          </button>
        </div>

        <!-- ── CONTENIDO DE LA PESTAÑA ACTIVA ── -->
        <div class="capfit-tab-content">
          ${renderTabContent(_activeTab, { user, fitProfile, selfies, addresses, wishlistIds, stats })}
        </div>

        <!-- ── FOOTER PERFIL ── -->
        <div class="capfit-profile-footer">
          <button class="btn-signout" onclick="window.CapfitCustomer.handleSignOut()">
            Cerrar Sesión
          </button>
        </div>
      </div>
    `;
  }

  function setTab(tabName) {
    _activeTab = tabName;
    renderAccountModalContent();
  }

  function goToBackoffice() {
    closeAccountModal();
    if (window.navigateToView) {
      window.navigateToView('admin');
    }
  }

  function renderTabContent(tab, data) {
    if (tab === 'fitProfile') return renderFitProfileTab(data);
    if (tab === 'selfies') return renderSelfiesTab(data);
    if (tab === 'addresses') return renderAddressesTab(data);
    if (tab === 'orders') return renderOrdersTab(data);
    if (tab === 'wishlist') return renderWishlistTab(data);
    return '';
  }

  /**
   * Pestaña 1: Medidas de Calce (Fit Profile)
   */
  function renderFitProfileTab({ fitProfile, user }) {
    const currentCm = fitProfile.headCircumferenceCm || '';
    const currentSize = fitProfile.fittedSize || (currentCm ? calculateCapSize(currentCm) : 'No definida');
    const styles = Array.isArray(fitProfile.preferredStyles) ? fitProfile.preferredStyles : [];

    const availableStyles = ['Urbana', 'Vintage', 'Minimal', 'Trucker', 'Snapback', 'Beanie', 'Curva'];

    return `
      <div class="fit-profile-section">
        <div class="fit-highlight-card">
          <div class="fit-badge">CALCE AUTOMÁTICO</div>
          <div class="fit-size-display">
            <span class="fit-size-val">${escapeHtml(currentSize || 'Ingresá tu medida')}</span>
            <span class="fit-size-desc">Talle recomendado para gorras cerradas y snapbacks</span>
          </div>
        </div>

        <form onsubmit="window.CapfitCustomer.saveFitProfileForm(event)" class="fit-form">
          <div class="capfit-form-field">
            <label for="fit-cm">
              <strong>Circunferencia de tu cabeza (en cm)</strong>
              <span class="field-hint">Medí alrededor de tu cabeza 1 cm por encima de las cejas.</span>
            </label>
            <div class="cm-input-row">
              <input type="number" id="fit-cm" step="0.5" min="50" max="65" value="${currentCm}" placeholder="Ej: 57" oninput="window.CapfitCustomer.onCmInputChange(this.value)">
              <span class="unit-pill">cm</span>
            </div>
            <div id="live-size-preview" class="live-size-preview">
              ${currentCm ? `Talle estimado: <strong>${calculateCapSize(currentCm)}</strong>` : ''}
            </div>
          </div>

          <div class="capfit-form-field">
            <label><strong>Estilos preferidos</strong></label>
            <div class="styles-pills-selector">
              ${availableStyles.map(s => `
                <label class="style-checkbox-pill ${styles.includes(s) ? 'selected' : ''}">
                  <input type="checkbox" name="fit_styles" value="${s}" ${styles.includes(s) ? 'checked' : ''} onchange="this.parentElement.classList.toggle('selected', this.checked)">
                  <span>${s}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div class="capfit-form-row">
            <div class="capfit-form-field half">
              <label for="fit-phone">Teléfono / WhatsApp</label>
              <input type="tel" id="fit-phone" value="${escapeHtml(user.phone || '')}" placeholder="+54 9 11 ...">
            </div>
            <div class="capfit-form-field half">
              <label for="fit-dni">DNI / Identificación</label>
              <input type="text" id="fit-dni" value="${escapeHtml(user.dni || '')}" placeholder="Número de DNI">
            </div>
          </div>

          <button type="submit" class="btn-capfit-primary">Guardar Mis Medidas</button>
        </form>
      </div>
    `;
  }

  function onCmInputChange(val) {
    const preview = document.getElementById('live-size-preview');
    if (!preview) return;
    const size = calculateCapSize(val);
    preview.innerHTML = size ? `Talle estimado: <strong>${size}</strong>` : '';
  }

  async function saveFitProfileForm(e) {
    e.preventDefault();
    const cm = document.getElementById('fit-cm')?.value;
    const phone = document.getElementById('fit-phone')?.value;
    const dni = document.getElementById('fit-dni')?.value;

    const selectedStyles = [];
    document.querySelectorAll('input[name="fit_styles"]:checked').forEach(cb => selectedStyles.push(cb.value));

    const fittedSize = calculateCapSize(cm);

    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PUT',
        headers: await getCustomerAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          uid: _currentUser.uid,
          phone: phone ? phone.trim() : '',
          dni: dni ? dni.trim() : '',
          fitProfile: {
            headCircumferenceCm: cm ? Number(cm) : null,
            preferredStyles: selectedStyles,
            fittedSize
          }
        })
      });

      const data = await res.json();
      if (data.ok) {
        _userProfile = data.user;
        if (window.showToast) window.showToast('¡Medidas de calce guardadas con éxito!');
        renderAccountModalContent();
      }
    } catch (err) {
      alert('Error guardando medidas: ' + err.message);
    }
  }

  /**
   * Pestaña 2: Mis Selfies del Probador Virtual (Base Selfies)
   */
  function renderSelfiesTab({ selfies }) {
    return `
      <div class="selfies-section">
        <div class="selfies-header-desc">
          <p>
            Tus selfies validadas se guardan en tu <strong>CapFit ID</strong> para que puedas probarte cualquier gorra en 1 solo clic en todas las tiendas, sin tener que volver a sacarte fotos.
          </p>
          <div class="selfies-cta-row">
            <label class="btn-upload-selfie">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Subir Nueva Selfie</span>
              <input type="file" accept="image/*" style="display:none;" onchange="window.CapfitCustomer.handleUploadSelfie(event)">
            </label>
            <button class="btn-camera-selfie" onclick="window.CapfitCustomer.openCameraForSelfie()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Usar Cámara</span>
            </button>
          </div>
        </div>

        <div id="selfie-upload-loader" style="display:none;padding:16px;text-align:center;font-size:0.9rem;color:#475569;">
          ⏳ Validando y comprimiendo rostro para IA...
        </div>

        ${selfies.length === 0 ? `
          <div class="empty-state-card">
            <div class="empty-icon">🤳</div>
            <h4>No tenés selfies guardadas todavía</h4>
            <p>Subí una foto frontal de tu rostro bien iluminada para empezar a probar gorras al instante.</p>
          </div>
        ` : `
          <div class="selfies-grid">
            ${selfies.map((s, i) => `
              <div class="selfie-card ${s.isDefault ? 'default' : ''}">
                <div class="selfie-img-wrap">
                  <img src="${escapeHtml(s.imageUrl)}" alt="Selfie ${i + 1}">
                  ${s.isDefault ? `<span class="selfie-badge-default">Predeterminada</span>` : ''}
                </div>
                <div class="selfie-actions">
                  <button class="btn-use-tryon" onclick="window.CapfitCustomer.useSelfieInTryOn('${s.id}')">
                    Probar ahora →
                  </button>
                  <button class="btn-icon-del" onclick="window.CapfitCustomer.deleteSelfie('${s.id}')" title="Eliminar selfie">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  async function handleUploadSelfie(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const loader = document.getElementById('selfie-upload-loader');
    if (loader) loader.style.display = 'block';

    try {
      // Usar compresor y utilidades de imagen del proyecto
      let compressedDataUrl;
      if (window.compressImageFile) {
        compressedDataUrl = await window.compressImageFile(file, 900, 0.85);
      } else {
        compressedDataUrl = await readFileAsDataUrl(file);
      }

      // Validar rostro con face-api si está cargado
      if (window.detectFaceInImage) {
        const faceRes = await window.detectFaceInImage(compressedDataUrl);
        if (faceRes && faceRes.detected === false) {
          if (!confirm('No detectamos un rostro claramente centrado en la imagen. ¿Deseás guardarla de todas formas?')) {
            if (loader) loader.style.display = 'none';
            return;
          }
        }
      }

      const res = await fetch('/api/customer/selfies', {
        method: 'POST',
        headers: await getCustomerAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          uid: _currentUser.uid,
          selfie: {
            id: `selfie_${Date.now()}`,
            imageUrl: compressedDataUrl,
            isDefault: true
          }
        })
      });

      const data = await res.json();
      if (data.ok) {
        _userProfile.baseSelfies = data.baseSelfies;
        if (window.showToast) window.showToast('¡Selfie guardada en tu CapFit ID!');
        updateTryOnQuickSelfies();
        renderAccountModalContent();
      }
    } catch (err) {
      alert('Error al guardar selfie: ' + err.message);
    } finally {
      if (loader) loader.style.display = 'none';
    }
  }

  function openCameraForSelfie() {
    closeAccountModal();
    if (window.navigateToView) window.navigateToView('probador');
    if (window.startCamera) window.startCamera();
  }

  async function deleteSelfie(selfieId) {
    if (!confirm('¿Seguro que deseás eliminar esta selfie?')) return;
    try {
      const res = await fetch('/api/customer/selfies', {
        method: 'DELETE',
        headers: await getCustomerAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ uid: _currentUser.uid, selfieId })
      });
      const data = await res.json();
      if (data.ok) {
        _userProfile.baseSelfies = data.baseSelfies;
        updateTryOnQuickSelfies();
        renderAccountModalContent();
      }
    } catch (err) {
      alert('Error eliminando selfie: ' + err.message);
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Pestaña 3: Mis Direcciones de Entrega
   */
  function renderAddressesTab({ addresses }) {
    return `
      <div class="addresses-section">
        <div class="addresses-header">
          <p>Direcciones guardadas para autocompletar el checkout de Mercado Pago en cualquier tienda CapFit.</p>
          <button class="btn-add-address" onclick="window.CapfitCustomer.toggleNewAddressForm()">
            + Agregar Dirección
          </button>
        </div>

        <div id="new-address-form-wrap" style="display:none;" class="new-address-card">
          <h4 style="font-size:0.95rem;font-weight:700;margin-bottom:12px;">Nueva Dirección</h4>
          <form onsubmit="window.CapfitCustomer.handleSaveAddress(event)">
            <div class="capfit-form-row">
              <div class="capfit-form-field half">
                <label>Alias (Ej: Casa, Oficina)</label>
                <input type="text" id="addr-alias" placeholder="Casa" required>
              </div>
              <div class="capfit-form-field half">
                <label>Nombre del Destinatario</label>
                <input type="text" id="addr-name" placeholder="Quién recibe el paquete" required>
              </div>
            </div>

            <div class="capfit-form-row">
              <div class="capfit-form-field two-thirds">
                <label>Calle</label>
                <input type="text" id="addr-street" placeholder="Av. Corrientes" required>
              </div>
              <div class="capfit-form-field one-third">
                <label>Número</label>
                <input type="text" id="addr-number" placeholder="1234" required>
              </div>
            </div>

            <div class="capfit-form-row">
              <div class="capfit-form-field one-third">
                <label>Piso / Depto</label>
                <input type="text" id="addr-floor" placeholder="4B (opcional)">
              </div>
              <div class="capfit-form-field one-third">
                <label>Ciudad</label>
                <input type="text" id="addr-city" placeholder="CABA" required>
              </div>
              <div class="capfit-form-field one-third">
                <label>Cód. Postal</label>
                <input type="text" id="addr-postal" placeholder="1043" required>
              </div>
            </div>

            <div class="capfit-form-field">
              <label>Provincia</label>
              <input type="text" id="addr-province" placeholder="Buenos Aires" required>
            </div>

            <div style="display:flex;gap:10px;margin-top:14px;">
              <button type="submit" class="btn-capfit-primary">Guardar Dirección</button>
              <button type="button" class="btn-capfit-secondary" onclick="window.CapfitCustomer.toggleNewAddressForm()">Cancelar</button>
            </div>
          </form>
        </div>

        ${addresses.length === 0 ? `
          <div class="empty-state-card">
            <div class="empty-icon">📍</div>
            <h4>No tenés direcciones registradas</h4>
            <p>Agregá tu dirección para despachos rápidos sin tener que volver a escribirla.</p>
          </div>
        ` : `
          <div class="addresses-list">
            ${addresses.map(a => `
              <div class="address-item-card ${a.isDefault ? 'default' : ''}">
                <div class="address-item-content">
                  <div class="address-item-title">
                    <strong>${escapeHtml(a.alias || 'Dirección')}</strong>
                    ${a.isDefault ? `<span class="badge-addr-default">Predeterminada</span>` : ''}
                  </div>
                  <div class="address-item-text">
                    ${escapeHtml(a.recipientName ? `${a.recipientName} • ` : '')}${escapeHtml(a.street)} ${escapeHtml(a.number)}${a.floorApt ? ` (${escapeHtml(a.floorApt)})` : ''}
                  </div>
                  <div class="address-item-sub">
                    ${escapeHtml(a.city)}, ${escapeHtml(a.province || '')} (CP ${escapeHtml(a.postalCode)})
                  </div>
                </div>
                <div class="address-item-actions">
                  <button class="btn-icon-del" onclick="window.CapfitCustomer.deleteAddress('${a.id}')" title="Eliminar dirección">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  function toggleNewAddressForm() {
    const wrap = document.getElementById('new-address-form-wrap');
    if (wrap) {
      wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    }
  }

  async function handleSaveAddress(e) {
    e.preventDefault();
    const alias = document.getElementById('addr-alias')?.value;
    const recipientName = document.getElementById('addr-name')?.value;
    const street = document.getElementById('addr-street')?.value;
    const number = document.getElementById('addr-number')?.value;
    const floorApt = document.getElementById('addr-floor')?.value;
    const city = document.getElementById('addr-city')?.value;
    const postalCode = document.getElementById('addr-postal')?.value;
    const province = document.getElementById('addr-province')?.value;

    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'POST',
        headers: await getCustomerAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          uid: _currentUser.uid,
          address: {
            alias,
            recipientName,
            street,
            number,
            floorApt,
            city,
            postalCode,
            province,
            isDefault: true
          }
        })
      });

      const data = await res.json();
      if (data.ok) {
        _userProfile.addresses = data.addresses;
        if (window.showToast) window.showToast('¡Dirección guardada!');
        renderAccountModalContent();
      }
    } catch (err) {
      alert('Error guardando dirección: ' + err.message);
    }
  }

  async function deleteAddress(addressId) {
    if (!confirm('¿Eliminar esta dirección?')) return;
    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'DELETE',
        headers: await getCustomerAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ uid: _currentUser.uid, addressId })
      });
      const data = await res.json();
      if (data.ok) {
        _userProfile.addresses = data.addresses;
        renderAccountModalContent();
      }
    } catch (err) {
      alert('Error eliminando dirección: ' + err.message);
    }
  }

  /**
   * Pestaña 4: Mis Pedidos & Envíos
   */
  function renderOrdersTab() {
    // Cargar órdenes asíncronamente
    setTimeout(loadUserOrdersList, 10);
    return `
      <div class="orders-section">
        <div id="orders-list-container">
          <div style="text-align:center;padding:24px;color:#64748b;">
            Cargando tus compras...
          </div>
        </div>
      </div>
    `;
  }

  async function loadUserOrdersList() {
    const container = document.getElementById('orders-list-container');
    if (!container || !_currentUser) return;

    try {
      const res = await fetch(`/api/customer/orders?uid=${encodeURIComponent(_currentUser.uid)}&email=${encodeURIComponent(_currentUser.email)}`, {
        headers: await getCustomerAuthHeaders()
      });
      const data = await res.json();
      const orders = (data && Array.isArray(data.orders)) ? data.orders : [];

      if (orders.length === 0) {
        container.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-icon">📦</div>
            <h4>Todavía no realizaste ningún pedido</h4>
            <p>Elegí una gorra del catálogo, probala en el probador IA y completá tu compra con Mercado Pago.</p>
            <button class="btn-capfit-primary" style="margin-top:14px;max-width:200px;margin-left:auto;margin-right:auto;" onclick="window.CapfitCustomer.closeAccountModal(); window.navigateToView('inicio');">
              Ver Catálogo
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="orders-cards-list">
          ${orders.map(o => {
            const tracking = o.shippingTracking || {};
            const trackingCode = o.trackingCode || tracking.trackingCode || '';
            const statusColor = (o.shippingStatus === 'Entregado' || o.paymentStatus === 'Aprobado') ? '#10b981' : '#f59e0b';

            return `
              <div class="order-history-card">
                <div class="order-card-header">
                  <div>
                    <span class="order-card-id">${escapeHtml(o.id)}</span>
                    <span class="order-card-date">${formatDate(o.date || o.createdAt)}</span>
                  </div>
                  <div class="order-card-status" style="color:${statusColor};background:${statusColor}15;">
                    ${escapeHtml(o.shippingStatus || o.paymentStatus || 'Procesando')}
                  </div>
                </div>

                <div class="order-card-items">
                  ${(Array.isArray(o.items) ? o.items : []).map(it => `
                    <div class="order-card-item-row">
                      <span class="order-item-qty">${it.quantity}x</span>
                      <span class="order-item-name">${escapeHtml(it.nombre || it.name || 'Gorra')}</span>
                      <span class="order-item-price">${formatPrice(it.precio || it.price)}</span>
                    </div>
                  `).join('')}
                </div>

                <div class="order-card-footer">
                  <div>
                    ${trackingCode ? `
                      <span class="tracking-pill">
                        🚚 Andreani: <strong>${escapeHtml(trackingCode)}</strong>
                      </span>
                    ` : '<span style="font-size:0.8rem;color:#64748b;">En preparación para despacho</span>'}
                  </div>
                  <div class="order-total-val">
                    Total: <strong>${formatPrice(o.total || o.totalAmount)}</strong>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color:#ef4444;text-align:center;">Error al cargar pedidos: ${err.message}</p>`;
    }
  }

  /**
   * Pestaña 5: Lista de Deseos (Wishlist)
   */
  function renderWishlistTab({ wishlistIds }) {
    const products = (window.Store && typeof window.Store.getProducts === 'function')
      ? window.Store.getProducts()
      : (window.catalogoProductos || []);

    const wishlistedProducts = products.filter(p => wishlistIds.includes(String(p.id)));

    return `
      <div class="wishlist-section">
        ${wishlistedProducts.length === 0 ? `
          <div class="empty-state-card">
            <div class="empty-icon">❤️</div>
            <h4>Tu lista de deseos está vacía</h4>
            <p>Hacé clic en el corazón de cualquier gorra del catálogo para guardarla acá.</p>
          </div>
        ` : `
          <div class="wishlist-grid">
            ${wishlistedProducts.map(p => `
              <div class="wishlist-item-card">
                <img src="${escapeHtml(p.imgPreview || p.imagen)}" alt="${escapeHtml(p.nombre)}">
                <div class="wishlist-item-details">
                  <h4>${escapeHtml(p.nombre)}</h4>
                  <span class="wishlist-price">${formatPrice(p.precio)}</span>
                  <div class="wishlist-btns">
                    <button class="btn-wishlist-try" onclick="window.CapfitCustomer.tryProductNow('${p.id}')">
                      Probar IA
                    </button>
                    <button class="btn-wishlist-cart" onclick="window.CapfitCustomer.addProductToCart('${p.id}')">
                      Al Carrito
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  function tryProductNow(prodId) {
    closeAccountModal();
    if (window.Store && Store.setGorraActivaById) {
      Store.setGorraActivaById(prodId);
    }
    if (window.navigateToView) window.navigateToView('probador');
  }

  function addProductToCart(prodId) {
    const products = (window.Store && typeof window.Store.getProducts === 'function')
      ? window.Store.getProducts()
      : (window.catalogoProductos || []);
    const p = products.find(item => String(item.id) === String(prodId));
    if (p && window.Cart) {
      window.Cart.addToCart(p, 1);
    }
  }

  async function toggleWishlist(productId) {
    if (!_currentUser) {
      openAccountModal();
      return false;
    }
    try {
      const storeId = getCurrentStoreId();
      const res = await fetch('/api/customer/wishlist', {
        method: 'POST',
        headers: await getCustomerAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          uid: _currentUser.uid,
          storeId,
          productId: String(productId)
        })
      });
      const data = await res.json();
      if (data.ok) {
        if (!_storeCustomer) _storeCustomer = {};
        _storeCustomer.wishlistProductIds = data.wishlistProductIds;
        if (window.showToast) {
          window.showToast(data.isWishlisted ? '❤️ Guardado en tus favoritos' : 'Eliminado de tus favoritos');
        }
        updateWishlistHeartUI();
        refreshAccountModalIfOpen();
        return data.isWishlisted;
      }
    } catch (err) {
      console.warn('Error alternando wishlist:', err);
    }
    return false;
  }

  function isWishlisted(productId) {
    if (!_storeCustomer || !Array.isArray(_storeCustomer.wishlistProductIds)) return false;
    return _storeCustomer.wishlistProductIds.includes(String(productId));
  }

  function updateWishlistHeartUI() {
    document.querySelectorAll('[data-wishlist-btn]').forEach(btn => {
      const prodId = btn.getAttribute('data-wishlist-btn');
      const active = isWishlisted(prodId);
      btn.classList.toggle('is-wishlisted', active);
    });
  }

  /**
   * Guarda una generación en el historial try_on_generations/{genId}
   */
  async function recordTryOnGeneration({ productId, productSnapshot, resultImageUrl }) {
    try {
      const storeId = getCurrentStoreId();
      const res = await fetch('/api/tryon/record-generation', {
        method: 'POST',
        headers: await getCustomerAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          storeId,
          userId: _currentUser ? _currentUser.uid : null,
          isOwnerTest: _isOwnerOfCurrentStore,
          productId,
          productSnapshot,
          resultImageUrl
        })
      });
      return await res.json();
    } catch (err) {
      console.warn('[recordTryOnGeneration] Error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Cierre de sesión de CapFit ID
   */
  async function handleSignOut() {
    if (window.CapfitAuth && typeof window.CapfitAuth.signOutUser === 'function') {
      await window.CapfitAuth.signOutUser();
    }
    _currentUser = null;
    _userProfile = null;
    _storeCustomer = null;
    _ownedStores = [];
    _isOwnerOfCurrentStore = false;
    updateHeaderAuthUI();
    updateTryOnQuickSelfies();
    closeAccountModal();
    if (window.showToast) window.showToast('Sesión cerrada');
  }

  function getDefaultAddress() {
    if (!_userProfile || !Array.isArray(_userProfile.addresses) || _userProfile.addresses.length === 0) {
      return null;
    }
    return _userProfile.addresses.find(a => a.isDefault) || _userProfile.addresses[0];
  }

  // Inicializar listener de Firebase Auth
  function init() {
    if (window.CapfitAuth && typeof window.CapfitAuth.onAuthStateChanged === 'function') {
      window.CapfitAuth.onAuthStateChanged(user => {
        syncCustomerSession(user).catch(() => {});
      });
    } else {
      setTimeout(init, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API Pública
  window.CapfitCustomer = {
    syncSession: syncCustomerSession,
    getUser: () => _userProfile,
    getFirebaseUser: () => _currentUser,
    getStoreCustomer: () => _storeCustomer,
    getOwnedStores: () => _ownedStores,
    isOwner: () => _isOwnerOfCurrentStore || _ownedStores.length > 0,
    getDefaultAddress,
    openAccountModal,
    closeAccountModal,
    switchAuthMode,
    handleGoogleAuth,
    handleEmailAuth,
    handleSignOut,
    setTab,
    goToBackoffice,
    onCmInputChange,
    saveFitProfileForm,
    handleUploadSelfie,
    openCameraForSelfie,
    deleteSelfie,
    useSelfieInTryOn,
    toggleNewAddressForm,
    handleSaveAddress,
    deleteAddress,
    toggleWishlist,
    isWishlisted,
    tryProductNow,
    addProductToCart,
    recordTryOnGeneration
  };

})();
