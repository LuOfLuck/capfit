// ── CAPFIT Backoffice & Store Admin Manager ──

const AdminPanel = (() => {
  const SESSION_KEY = 'capfit_admin_auth_token';
  const ROLE_KEY = 'capfit_admin_role';
  const STORE_ID_KEY = 'capfit_admin_store_id';
  const STORE_NAME_KEY = 'capfit_admin_store_name';
  const SUBDOMAIN_KEY = 'capfit_admin_subdomain';

  const USER_EMAIL_KEY = 'capfit_user_email';
  const USER_NAME_KEY = 'capfit_user_name';

  let _products = [];
  let _orders = [];
  let _activeTab = 'catalogo'; // 'catalogo' | 'pedidos' | 'nuevo' | 'secciones' | 'tiendas'
  let _activeSectionSubtab = 'home'; // 'home' | 'about' | 'faq' | 'envios' | 'cambios' | 'contacto' | 'terminos' | 'privacidad'
  let _productSearch = '';
  let _productStockFilter = 'todos'; // 'todos' | 'bajo' | 'agotado' | 'disponible'
  let _productTypeFilter = 'todos'; // 'todos' | 'gorra' | 'anteojos' | 'gorro'
  let _orderSearch = '';
  let _orderPaymentFilter = 'todos';
  let _orderShippingFilter = 'todos';
  let _editingProduct = null;

  // Multi-tenant, SaaS & Firebase Auth State
  function sanitizeStoreId(s) {
    if (!s || typeof s !== 'string') return '';
    const clean = s.trim();
    if (clean.startsWith('ais-') || clean.includes('run.app') || clean.includes('localhost')) {
      return '';
    }
    return clean;
  }

  let _adminRole = sessionStorage.getItem(ROLE_KEY) || sessionStorage.getItem('capfit_role') || 'store_owner';
  let _storedStore = sanitizeStoreId(sessionStorage.getItem(STORE_ID_KEY)) || sanitizeStoreId(sessionStorage.getItem('capfit_store_id'));
  let _currentStoreId = _storedStore || (window.Store && Store.getCurrentStoreId && !Store.getCurrentStoreId().startsWith('ais-') ? Store.getCurrentStoreId() : 'principal');
  let _currentStoreName = sessionStorage.getItem(STORE_NAME_KEY) || sessionStorage.getItem('capfit_store_name') || 'CAPFIT Store';
  let _currentSubdomain = sessionStorage.getItem(SUBDOMAIN_KEY) || sessionStorage.getItem('capfit_store_subdomain') || 'tienda1';
  let _userEmail = sessionStorage.getItem(USER_EMAIL_KEY) || '';
  let _userName = sessionStorage.getItem(USER_NAME_KEY) || '';
  let _portalTab = 'login'; // 'login' | 'register'
  let _aiQuota = null;
  let _allStores = [];
  let _loginMode = 'store'; // 'store' | 'superadmin'

  function isLoggedIn() {
    return !!(sessionStorage.getItem(SESSION_KEY) || sessionStorage.getItem('capfit_session'));
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getStoreQuery() {
    return _currentStoreId ? `?store=${encodeURIComponent(_currentStoreId)}` : '';
  }

  function formatPrecio(n) {
    return '$' + Number(n || 0).toLocaleString('es-AR');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoStr;
    }
  }

  // ── Firebase Auth & Store Owner Methods ──
  async function loginWithGoogle() {
    const errorEl = document.getElementById('admin-login-error');
    if (errorEl) errorEl.style.display = 'none';

    const btn = document.getElementById('btn-google-auth');
    const originalContent = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;gap:8px">⏳ Conectando con Google...</span>`;
    }

    try {
      if (!window.CapfitAuth) throw new Error('Módulo Firebase Auth no está listo. Recargá la página.');
      const user = await CapfitAuth.signInWithGoogle();
      const targetStore = (window.Store && Store.getCurrentStoreId) ? Store.getCurrentStoreId() : null;
      const cleanTargetStore = (targetStore && !targetStore.startsWith('ais-')) ? targetStore : null;
      const verifyRes = await CapfitAuth.verifySessionWithBackend(user, cleanTargetStore);

      if (verifyRes.verified) {
        _adminRole = verifyRes.role || 'store_owner';
        _currentStoreId = verifyRes.storeId || 'principal';
        _currentStoreName = verifyRes.storeName || 'Mi Tienda';
        _currentSubdomain = verifyRes.subdomain || 'tienda1';
        _userEmail = user.email || '';
        _userName = user.displayName || '';

        sessionStorage.setItem(SESSION_KEY, verifyRes.token);
        sessionStorage.setItem(ROLE_KEY, _adminRole);
        sessionStorage.setItem(STORE_ID_KEY, _currentStoreId);
        sessionStorage.setItem(STORE_NAME_KEY, _currentStoreName);
        sessionStorage.setItem(SUBDOMAIN_KEY, _currentSubdomain);
        sessionStorage.setItem(USER_EMAIL_KEY, _userEmail);
        sessionStorage.setItem(USER_NAME_KEY, _userName);

        if (window.showToast) window.showToast(`¡Bienvenido al Backoffice, ${_userName || _userEmail}!`);
        render();
      } else if (verifyRes.needRegisterStore) {
        _portalTab = 'register';
        renderLoginView();
        const regEmailInput = document.getElementById('reg-owner-email');
        const regNameInput = document.getElementById('reg-owner-name');
        if (regEmailInput) regEmailInput.value = user.email || '';
        if (regNameInput) regNameInput.value = user.displayName || '';

        const infoEl = document.getElementById('admin-login-info');
        if (infoEl) {
          infoEl.textContent = `¡Cuenta Google verificada (${user.email})! Ahora indicá el nombre de tu tienda para finalizar el alta.`;
          infoEl.style.display = 'block';
        }
      }
    } catch (err) {
      console.error('Error Google Sign-In:', err);
      if (errorEl) {
        errorEl.textContent = err.message || 'Error al autenticar con Google';
        errorEl.style.display = 'block';
      } else {
        alert(err.message);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    }
  }

  async function loginWithFirebaseEmail(emailOrUser, password) {
    const errorEl = document.getElementById('admin-login-error');
    if (errorEl) errorEl.style.display = 'none';

    const submitBtn = document.getElementById('btn-admin-submit-login');
    const origText = submitBtn ? submitBtn.innerHTML : 'Iniciar Sesión';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Iniciando sesión...</span>`;
    }

    try {
      const cleanInput = (emailOrUser || '').trim();
      const cleanPass = (password || '').trim();

      if (!cleanInput || !cleanPass) {
        throw new Error('Por favor completá tu usuario/correo y contraseña.');
      }

      const activeStore = (window.Store && Store.getCurrentStoreId && !Store.getCurrentStoreId().startsWith('ais-')) ? Store.getCurrentStoreId() : null;

      // Si no es un email con @, intentar login tradicional por usuario de tienda directamente
      if (!cleanInput.includes('@')) {
        await login(cleanInput, cleanPass, activeStore);
        return;
      }

      // Si es un correo con @, intentar primero Firebase Auth
      if (!window.CapfitAuth) {
        await login(cleanInput, cleanPass, activeStore);
        return;
      }
      
      let user;
      try {
        user = await CapfitAuth.signInWithEmail(cleanInput, cleanPass);
      } catch (authErr) {
        // Fallback al backend por si es una cuenta local de tienda o credenciales especiales
        try {
          await login(cleanInput, cleanPass, activeStore);
          return;
        } catch (backendErr) {
          throw authErr;
        }
      }

      const verifyRes = await CapfitAuth.verifySessionWithBackend(user, activeStore);

      if (verifyRes.verified) {
        _adminRole = verifyRes.role || 'store_owner';
        _currentStoreId = verifyRes.storeId || 'principal';
        _currentStoreName = verifyRes.storeName || 'Mi Tienda';
        _currentSubdomain = verifyRes.subdomain || 'tienda1';
        _userEmail = user.email || cleanInput;
        _userName = user.displayName || '';

        sessionStorage.setItem(SESSION_KEY, verifyRes.token);
        sessionStorage.setItem(ROLE_KEY, _adminRole);
        sessionStorage.setItem(STORE_ID_KEY, _currentStoreId);
        sessionStorage.setItem(STORE_NAME_KEY, _currentStoreName);
        sessionStorage.setItem(SUBDOMAIN_KEY, _currentSubdomain);
        sessionStorage.setItem(USER_EMAIL_KEY, _userEmail);
        sessionStorage.setItem(USER_NAME_KEY, _userName);

        if (window.showToast) window.showToast('¡Sesión iniciada con éxito!');
        render();
      } else if (verifyRes.needRegisterStore) {
        _portalTab = 'register';
        renderLoginView();
        const regEmailInput = document.getElementById('reg-owner-email');
        if (regEmailInput) regEmailInput.value = user.email || '';
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Error de autenticación';
        errorEl.style.display = 'block';
      } else {
        alert(err.message);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
      }
    }
  }

  async function registerNewStoreOwner(data) {
    const errorEl = document.getElementById('admin-register-error');
    if (errorEl) errorEl.style.display = 'none';

    const btn = document.getElementById('btn-register-submit');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳ Creando tienda en Firebase...</span>`;
    }

    try {
      if (!window.CapfitAuth) throw new Error('Módulo Firebase Auth no disponible.');

      let user = CapfitAuth.getCurrentUser();
      if (!user) {
        user = await CapfitAuth.registerWithEmail(data.email, data.password);
      }

      const regRes = await CapfitAuth.registerStoreForOwner({
        storeName: data.storeName,
        subdomain: data.subdomain,
        plan: data.plan || 'Starter',
        tagline: data.tagline || `Tienda oficial ${data.storeName}`,
        firebaseUser: user
      });

      _adminRole = 'store_owner';
      _currentStoreId = regRes.storeId;
      _currentStoreName = regRes.storeName;
      _currentSubdomain = regRes.subdomain;
      _userEmail = user.email || '';
      _userName = user.displayName || data.storeName;

      sessionStorage.setItem(SESSION_KEY, regRes.token);
      sessionStorage.setItem(ROLE_KEY, _adminRole);
      sessionStorage.setItem(STORE_ID_KEY, _currentStoreId);
      sessionStorage.setItem(STORE_NAME_KEY, _currentStoreName);
      sessionStorage.setItem(SUBDOMAIN_KEY, _currentSubdomain);
      sessionStorage.setItem(USER_EMAIL_KEY, _userEmail);
      sessionStorage.setItem(USER_NAME_KEY, _userName);

      if (window.showToast) window.showToast(`¡Tienda "${data.storeName}" creada con éxito!`);
      render();
    } catch (err) {
      console.error('Error registrando tienda:', err);
      if (errorEl) {
        errorEl.textContent = err.message || 'Error al registrar tienda';
        errorEl.style.display = 'block';
      } else {
        alert(err.message);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Crear Tienda y Abrir Backoffice →</span>`;
      }
    }
  }

  // ── Traditional Fallback Authentication ──
  async function login(username, password, storeId = null) {
    const errorEl = document.getElementById('admin-login-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
      const candidateStore = storeId || _currentStoreId || (window.Store && Store.getCurrentStoreId ? Store.getCurrentStoreId() : null);
      const cleanStore = (candidateStore && typeof candidateStore === 'string' && !candidateStore.startsWith('ais-')) ? candidateStore.trim() : null;

      const payload = {
        username: (username || '').trim(),
        password: (password || '').trim(),
        storeId: cleanStore
      };

      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Credenciales inválidas');
      }

      _adminRole = data.role || 'store_owner';
      _currentStoreId = data.storeId || 'principal';
      _currentStoreName = data.storeName || (data.role === 'superadmin' ? 'Plataforma CAPFIT' : 'Mi Tienda');
      _currentSubdomain = data.subdomain || 'tienda1';
      _userEmail = payload.username.includes('@') ? payload.username : `${payload.username}@capfit.store`;

      sessionStorage.setItem(SESSION_KEY, data.token || 'valid');
      sessionStorage.setItem(ROLE_KEY, _adminRole);
      sessionStorage.setItem(STORE_ID_KEY, _currentStoreId);
      sessionStorage.setItem(STORE_NAME_KEY, _currentStoreName);
      sessionStorage.setItem(SUBDOMAIN_KEY, _currentSubdomain);
      sessionStorage.setItem(USER_EMAIL_KEY, _userEmail);
      localStorage.setItem('capfit_active_store_id', _currentStoreId);

      if (window.showToast) {
        window.showToast(data.message || '¡Sesión de administración iniciada!');
      }
      render();
    } catch (e) {
      if (errorEl) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
      } else {
        alert(e.message);
      }
    }
  }

  async function logout() {
    if (window.CapfitAuth && CapfitAuth.signOutUser) {
      await CapfitAuth.signOutUser().catch(() => {});
    }
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(STORE_ID_KEY);
    sessionStorage.removeItem(STORE_NAME_KEY);
    sessionStorage.removeItem(SUBDOMAIN_KEY);
    sessionStorage.removeItem(USER_EMAIL_KEY);
    sessionStorage.removeItem(USER_NAME_KEY);
    sessionStorage.removeItem('capfit_session');
    sessionStorage.removeItem('capfit_role');
    sessionStorage.removeItem('capfit_store_id');
    sessionStorage.removeItem('capfit_store_subdomain');
    sessionStorage.removeItem('capfit_store_name');
    _adminRole = 'store_owner';
    _userEmail = '';
    _userName = '';
    if (window.showToast) window.showToast('Sesión de administrador cerrada');
    render();
  }

  // ── Data Fetching ──
  async function loadProducts() {
    try {
      const res = await fetch(`/api/products${getStoreQuery()}`);
      if (res.ok) {
        _products = await res.json();
      }
    } catch (e) {
      console.error('[Admin] Error cargando productos:', e);
    }
  }

  async function loadOrders() {
    try {
      const res = await fetch(`/api/orders${getStoreQuery()}`);
      if (res.ok) {
        _orders = await res.json();
      }
    } catch (e) {
      console.error('[Admin] Error cargando pedidos:', e);
    }
  }

  async function loadStoreQuota() {
    try {
      const res = await fetch(`/api/store/current${getStoreQuery()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          _aiQuota = data.aiQuota;
          if (data.store) {
            _currentStoreName = data.store.name;
            _currentSubdomain = data.store.subdomain;
            sessionStorage.setItem(STORE_NAME_KEY, _currentStoreName);
            sessionStorage.setItem(SUBDOMAIN_KEY, _currentSubdomain);
          }
        }
      }
    } catch (e) {
      console.warn('[Admin] Error cargando cuota:', e);
    }
  }

  async function loadAllStores() {
    if (_adminRole !== 'superadmin') return;
    try {
      const res = await fetch('/api/admin/stores');
      if (res.ok) {
        _allStores = await res.json();
      }
    } catch (e) {
      console.error('[Admin] Error cargando lista SaaS de tiendas:', e);
    }
  }

  async function refreshData() {
    await Promise.all([loadProducts(), loadOrders(), loadStoreQuota(), loadAllStores()]);
    renderMetrics();
    renderActiveTabContent();
  }

  // ── Metric Calculations ──
  function getMetrics() {
    const totalVentas = _orders
      .filter(o => o.paymentStatus === 'Aprobado')
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

    const totalOrders = _orders.length;
    const pendingShipping = _orders.filter(o => o.shippingStatus === 'Por preparar').length;
    const totalProducts = _products.length;
    const lowStockCount = _products.filter(p => (p.stock !== undefined && p.stock <= 5)).length;

    return {
      totalVentas,
      totalOrders,
      pendingShipping,
      totalProducts,
      lowStockCount
    };
  }

  // ── Stock and Price Quick Modifiers ──
  async function updateProductStock(id, newStock) {
    const stockVal = Math.max(0, parseInt(newStock, 10) || 0);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}${getStoreQuery()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: stockVal })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al actualizar stock');

      const p = _products.find(item => item.id === id);
      if (p) p.stock = stockVal;

      if (window.showToast) window.showToast(`Stock de "${p ? p.nombre : id}" actualizado: ${stockVal} un.`);
      if (window.Catalogo) window.Catalogo.reload();
      renderMetrics();
      renderProductsTable();
    } catch (e) {
      alert('No se pudo actualizar el stock: ' + e.message);
    }
  }

  async function updateProductPrice(id, newPrice, newPrevPrice = null) {
    const priceVal = Math.max(0, parseFloat(newPrice) || 0);
    try {
      const payload = { precio: priceVal };
      if (newPrevPrice !== null) {
        payload.precioAnterior = newPrevPrice ? Math.max(0, parseFloat(newPrevPrice)) : null;
      }

      const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}${getStoreQuery()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al actualizar precio');

      const p = _products.find(item => item.id === id);
      if (p) {
        p.precio = priceVal;
        if (newPrevPrice !== null) p.precioAnterior = payload.precioAnterior;
      }

      if (window.showToast) window.showToast(`Precio actualizado: ${formatPrecio(priceVal)}`);
      if (window.Catalogo) window.Catalogo.reload();
      renderMetrics();
      renderProductsTable();
    } catch (e) {
      alert('No se pudo actualizar el precio: ' + e.message);
    }
  }

  // ── Delete Product ──
  async function deleteProduct(id) {
    const prod = _products.find(p => p.id === id);
    const prodName = prod ? prod.nombre : id;

    if (!confirm(`¿Estás seguro de que querés eliminar "${prodName}" del catálogo? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}${getStoreQuery()}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al eliminar');

      _products = _products.filter(p => p.id !== id);
      if (window.showToast) window.showToast(`"${prodName}" fue eliminado del catálogo`);
      if (window.Catalogo) window.Catalogo.reload();
      renderMetrics();
      renderProductsTable();
    } catch (e) {
      alert('Error eliminando producto: ' + e.message);
    }
  }

  // ── Client-side Image Cropper & Square WebP Converter ──
  function cropAndConvertToSquareWebP(file, targetSize = 600) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Error al leer el archivo de imagen'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagen inválido o corrupto'));
        img.onload = () => {
          // Modal de recorte interactivo
          const modal = document.createElement('div');
          modal.className = 'crop-modal-backdrop';
          modal.id = 'capfit-crop-modal';

          modal.innerHTML = `
            <div class="crop-modal-card">
              <div class="crop-modal-header">
                <h3>Recortar y Optimizar Prenda</h3>
                <button type="button" class="modal-close-btn" id="crop-btn-cancel-x">×</button>
              </div>
              <div class="crop-modal-body">
                <div class="crop-canvas-wrapper" id="crop-canvas-box">
                  <canvas id="crop-preview-canvas" width="320" height="320"></canvas>
                  <div class="crop-overlay-grid"></div>
                </div>

                <div class="crop-controls">
                  <div class="crop-zoom-row">
                    <span>🔍 Zoom:</span>
                    <input type="range" id="crop-zoom-range" class="crop-zoom-slider" min="1" max="3" step="0.05" value="1">
                    <span id="crop-zoom-val" style="min-width:32px;text-align:right">1.0x</span>
                  </div>
                  <div class="crop-info-pill">
                    <span>Arrostrá la imagen para encuadrar la prenda</span>
                    <span class="crop-badge-webp">Formato WebP (Cuadrado)</span>
                  </div>
                </div>
              </div>
              <div class="crop-modal-footer">
                <button type="button" class="admin-btn-outline" id="crop-btn-cancel">Cancelar</button>
                <button type="button" class="admin-btn-primary" id="crop-btn-confirm" style="display:inline-flex;align-items:center;gap:6px">
                  <span>Guardar como .webp</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
              </div>
            </div>
          `;

          document.body.appendChild(modal);

          const canvas = modal.querySelector('#crop-preview-canvas');
          const ctx = canvas.getContext('2d');
          const zoomSlider = modal.querySelector('#crop-zoom-range');
          const zoomVal = modal.querySelector('#crop-zoom-val');
          const wrapper = modal.querySelector('#crop-canvas-box');

          const canvasSize = 320;
          canvas.width = canvasSize;
          canvas.height = canvasSize;

          // Estado del recorte
          let zoom = 1;
          let panX = 0;
          let panY = 0;
          let isDragging = false;
          let startDragX = 0;
          let startDragY = 0;

          // Escalar imagen para que encaje inicialmente (cover o contain)
          const baseScale = Math.max(canvasSize / img.width, canvasSize / img.height);

          function redraw() {
            ctx.clearRect(0, 0, canvasSize, canvasSize);
            // Fondo blanco puro para recorte de catálogo limpio
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvasSize, canvasSize);

            const curScale = baseScale * zoom;
            const drawW = img.width * curScale;
            const drawH = img.height * curScale;

            // Restringir el paneo para que no se pierda la imagen
            const maxPanX = Math.max(0, (drawW - canvasSize) / 2);
            const maxPanY = Math.max(0, (drawH - canvasSize) / 2);
            panX = Math.min(maxPanX, Math.max(-maxPanX, panX));
            panY = Math.min(maxPanY, Math.max(-maxPanY, panY));

            const posX = (canvasSize - drawW) / 2 + panX;
            const posY = (canvasSize - drawH) / 2 + panY;

            ctx.drawImage(img, posX, posY, drawW, drawH);
          }

          redraw();

          // Manejador de Zoom
          zoomSlider.addEventListener('input', (e) => {
            zoom = parseFloat(e.target.value);
            zoomVal.textContent = zoom.toFixed(1) + 'x';
            redraw();
          });

          // Manejador de arrastre con mouse y touch
          function onPointerDown(clientX, clientY) {
            isDragging = true;
            startDragX = clientX - panX;
            startDragY = clientY - panY;
          }

          function onPointerMove(clientX, clientY) {
            if (!isDragging) return;
            panX = clientX - startDragX;
            panY = clientY - startDragY;
            redraw();
          }

          function onPointerUp() {
            isDragging = false;
          }

          wrapper.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
          window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
          window.addEventListener('mouseup', onPointerUp);

          wrapper.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
              onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
            }
          }, { passive: true });
          window.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
              onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
            }
          }, { passive: true });
          window.addEventListener('touchend', onPointerUp);

          function cleanup() {
            window.removeEventListener('mousemove', onPointerMove);
            window.removeEventListener('mouseup', onPointerUp);
            window.removeEventListener('touchmove', onPointerMove);
            window.removeEventListener('touchend', onPointerUp);
            modal.remove();
          }

          modal.querySelector('#crop-btn-cancel').onclick = () => {
            cleanup();
            reject(new Error('Recorte cancelado por el usuario'));
          };
          modal.querySelector('#crop-btn-cancel-x').onclick = () => {
            cleanup();
            reject(new Error('Recorte cancelado por el usuario'));
          };

          modal.querySelector('#crop-btn-confirm').onclick = () => {
            // Renderizar al tamaño final de alta resolución (targetSize x targetSize)
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = targetSize;
            exportCanvas.height = targetSize;
            const expCtx = exportCanvas.getContext('2d');

            expCtx.fillStyle = '#ffffff';
            expCtx.fillRect(0, 0, targetSize, targetSize);

            const scaleRatio = targetSize / canvasSize;
            const finalScale = baseScale * zoom * scaleRatio;
            const drawW = img.width * finalScale;
            const drawH = img.height * finalScale;
            const posX = (targetSize - drawW) / 2 + (panX * scaleRatio);
            const posY = (targetSize - drawH) / 2 + (panY * scaleRatio);

            expCtx.drawImage(img, posX, posY, drawW, drawH);

            // Convertir canvas a WebP
            let webpDataUrl = exportCanvas.toDataURL('image/webp', 0.90);
            // Fallback si el browser no soporta WebP en toDataURL
            if (!webpDataUrl.startsWith('data:image/webp')) {
              webpDataUrl = exportCanvas.toDataURL('image/png');
            }

            const cleanName = (file.name || 'prenda').replace(/\.[^/.]+$/, "") + '.webp';
            cleanup();
            resolve({
              base64: webpDataUrl,
              filename: cleanName
            });
          };
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Upload Image to Server (Procesando a WebP cuadrado) ──
  async function uploadImageFile(file) {
    // 1. Recortar y convertir a WebP cuadrado
    const processed = await cropAndConvertToSquareWebP(file, 600);

    // 2. Enviar la imagen ya procesada en .webp al backend
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: processed.filename,
        base64: processed.base64
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Fallo al subir imagen optimizada');
    return data.url;
  }

  // ── Order Modifiers ──
  // ── Order Modifiers ──
  async function updateOrderStatus(orderId, updates) {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}${getStoreQuery()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error actualizando pedido');

      const o = _orders.find(item => item.id === orderId);
      if (o) {
        Object.assign(o, updates);
      }

      if (window.showToast) window.showToast(`Pedido ${orderId} actualizado con éxito`);
      renderMetrics();
      renderOrdersList();
    } catch (e) {
      alert('Error actualizando pedido: ' + e.message);
    }
  }

  // ── RENDERERS ──

  function setPortalTab(tab) {
    _portalTab = tab;
    renderLoginView();
  }

  function setLoginMode(mode) {
    _loginMode = mode;
    renderLoginView();
  }

  function fillDemoLogin(user, pass) {
    const userInput = document.getElementById('admin-user-input');
    const passInput = document.getElementById('admin-pass-input');
    if (userInput && user) userInput.value = user;
    if (passInput && pass) passInput.value = pass;
    submitLogin();
  }

  function submitRegisterStoreOwner() {
    const nameEl = document.getElementById('reg-owner-name');
    const emailEl = document.getElementById('reg-owner-email');
    const passEl = document.getElementById('reg-owner-pass');
    const storeNameEl = document.getElementById('reg-store-name');
    const subdomEl = document.getElementById('reg-store-subdomain');
    const planEl = document.getElementById('reg-store-plan');

    const name = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const pass = passEl ? passEl.value.trim() : '';
    const storeName = storeNameEl ? storeNameEl.value.trim() : '';
    const subdomain = subdomEl ? subdomEl.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
    const plan = planEl ? planEl.value : 'Starter';

    const errBox = document.getElementById('admin-register-error');
    if (errBox) errBox.style.display = 'none';

    if (!storeName) {
      if (errBox) { errBox.textContent = 'Por favor ingresá el nombre de tu tienda.'; errBox.style.display = 'block'; }
      return;
    }
    if (!subdomain || subdomain.length < 3) {
      if (errBox) { errBox.textContent = 'El subdominio debe tener al menos 3 caracteres alfanuméricos.'; errBox.style.display = 'block'; }
      return;
    }

    const currentUser = window.CapfitAuth ? CapfitAuth.getCurrentUser() : null;
    if (!currentUser && (!email || !pass)) {
      if (errBox) { errBox.textContent = 'Por favor ingresá tu email y una contraseña de al menos 6 caracteres.'; errBox.style.display = 'block'; }
      return;
    }

    registerNewStoreOwner({
      name,
      email,
      password: pass,
      storeName,
      subdomain,
      plan
    });
  }

  function renderLoginView() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const isLoginTab = _portalTab === 'login';
    const currentUser = window.CapfitAuth ? CapfitAuth.getCurrentUser() : null;

    container.innerHTML = `
      <div class="auth-card">
        
        <!-- Segmented Tab Switcher -->
        <div class="auth-tabs">
          <button type="button" class="auth-tab-btn ${isLoginTab ? 'active' : ''}" onclick="AdminPanel.setPortalTab('login')">
            Iniciar Sesión
          </button>
          <button type="button" class="auth-tab-btn ${!isLoginTab ? 'active' : ''}" onclick="AdminPanel.setPortalTab('register')">
            Crear Mi Tienda
          </button>
        </div>

        ${isLoginTab ? `
          <!-- ── TAB: INICIAR SESIÓN ── -->
          <div class="auth-header">
            <h2 class="auth-title">Bienvenido de vuelta</h2>
            <p class="auth-sub">Accedé a tu cuenta para gestionar tu catálogo, pedidos y configuración de tu tienda.</p>
            ${_currentStoreId && !_currentStoreId.startsWith('ais-') ? `
              <div style="margin-top:10px;display:inline-flex;align-items:center;gap:6px;background:#f1f5f9;color:#334155;padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:600">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981"></span>
                <span>Tienda activa: <strong>${_currentStoreName || _currentStoreId}</strong></span>
              </div>
            ` : ''}
          </div>

          <!-- Botón de Continuar con Google -->
          <button type="button" id="btn-google-auth" class="auth-google-btn" onclick="AdminPanel.loginWithGoogle()">
            <svg style="width:20px;height:20px" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Continuar con Google</span>
          </button>

          <!-- Divisor -->
          <div class="auth-divider">
            <span>o continúa con tus credenciales</span>
          </div>

          <form onsubmit="event.preventDefault(); AdminPanel.submitFirebaseEmailLogin();">
            <div class="auth-field-group">
              <label class="auth-label" for="admin-email-input">Correo electrónico o Usuario de Tienda</label>
              <input type="text" id="admin-email-input" class="auth-input" placeholder="tu@email.com o usuario de tienda" required autocomplete="username">
            </div>

            <div class="auth-field-group">
              <label class="auth-label" for="admin-pass-input">Contraseña</label>
              <div class="auth-input-wrap">
                <input type="password" id="admin-pass-input" class="auth-input" placeholder="••••••••••" required autocomplete="current-password">
                <button type="button" class="auth-eye-btn" onclick="AdminPanel.togglePasswordVisibility('admin-pass-input')" aria-label="Mostrar contraseña">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px" id="admin-pass-eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
              <div class="auth-forgot-row">
                <button type="button" class="auth-link-forgot" onclick="AdminPanel.handleForgotPassword()">¿Olvidaste tu contraseña?</button>
              </div>
            </div>

            <div id="admin-login-error" class="auth-error-box" style="display:none"></div>
            <div id="admin-login-info" class="auth-info-box" style="display:none"></div>

            <button type="submit" class="auth-btn-primary" id="btn-admin-submit-login">
              Iniciar Sesión
            </button>
          </form>

          <p class="auth-switch-text">
            ¿No tenés cuenta? <button type="button" class="auth-switch-btn" onclick="AdminPanel.setPortalTab('register')">Crear mi tienda</button>
          </p>

          <div class="auth-card-footer">
            <p class="auth-footer-copy">© 2026 CAPFIT. Todos los derechos reservados.</p>
            <div class="auth-footer-links">
              <a href="javascript:void(0)" onclick="AdminPanel.showTermsModal()">Términos de Servicio</a>
              <span class="auth-footer-sep">|</span>
              <a href="javascript:void(0)" onclick="AdminPanel.showPrivacyModal()">Política de Privacidad</a>
            </div>
          </div>
        ` : `
          <!-- ── TAB: REGISTRAR TIENDA (MISMA ESTÉTICA) ── -->
          <div class="auth-header">
            <h2 class="auth-title">Creá tu Tienda</h2>
            <p class="auth-sub">Lanzá tu tienda online con probador virtual IA y comenzá a vender hoy mismo.</p>
          </div>

          ${currentUser ? `
            <div class="auth-info-box" style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
              <span style="font-size:1.1rem">✅</span>
              <div>
                Autenticado con Google como: <strong>${currentUser.email}</strong><br>
                <small>Tu tienda quedará vinculada automáticamente a tu cuenta.</small>
              </div>
            </div>
          ` : `
            <button type="button" id="btn-google-auth-reg" class="auth-google-btn" onclick="AdminPanel.loginWithGoogle()">
              <svg style="width:20px;height:20px" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Registrarse con Google</span>
            </button>

            <div class="auth-divider">
              <span>o completa los datos de tu tienda</span>
            </div>
          `}

          <form onsubmit="event.preventDefault(); AdminPanel.submitRegisterStoreOwner();">
            <div class="auth-field-group">
              <label class="auth-label" for="reg-owner-name">Tu Nombre o Marca</label>
              <input type="text" id="reg-owner-name" class="auth-input" placeholder="Nombre completo o marca" value="${currentUser ? (currentUser.displayName || '') : ''}" required>
            </div>

            <div class="auth-field-group">
              <label class="auth-label" for="reg-owner-email">Correo electrónico</label>
              <input type="email" id="reg-owner-email" class="auth-input" placeholder="tu@email.com" value="${currentUser ? currentUser.email : ''}" ${currentUser ? 'readonly' : 'required'}>
            </div>

            ${!currentUser ? `
              <div class="auth-field-group">
                <label class="auth-label" for="reg-owner-pass">Contraseña</label>
                <div class="auth-input-wrap">
                  <input type="password" id="reg-owner-pass" class="auth-input" placeholder="Mínimo 6 caracteres" required autocomplete="new-password">
                  <button type="button" class="auth-eye-btn" onclick="AdminPanel.togglePasswordVisibility('reg-owner-pass')" aria-label="Mostrar contraseña">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
              </div>
            ` : ''}

            <div class="auth-field-group">
              <label class="auth-label" for="reg-store-name">Nombre Comercial de la Tienda</label>
              <input type="text" id="reg-store-name" class="auth-input" placeholder="Ej: Urban Streetwear" required oninput="AdminPanel.syncSubdomainSuggestion(this.value)">
            </div>

            <div class="auth-field-group">
              <label class="auth-label" for="reg-store-subdomain">Subdominio de tu Tienda</label>
              <div style="display:flex;align-items:center;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:0 14px;overflow:hidden">
                <input type="text" id="reg-store-subdomain" placeholder="urban" required style="border:none;background:transparent;padding:13px 0;width:100%;font-family:inherit;font-weight:600;outline:none;font-size:0.92rem;color:#0f172a" oninput="AdminPanel.updateSubdomainPreview(this.value)">
                <span style="color:#64748b;font-weight:600;font-size:0.88rem;white-space:nowrap">.capfit.store</span>
              </div>
              <div id="subdomain-live-preview" style="font-size:0.75rem;color:#0284c7;margin-top:6px;text-align:left">
                URL de tu tienda: <strong>https://urban.capfit.store</strong>
              </div>
            </div>

            <div class="auth-field-group">
              <label class="auth-label" for="reg-store-plan">Plan de Servicio</label>
              <select id="reg-store-plan" class="auth-input" style="height:48px;padding:0 14px;cursor:pointer">
                <option value="Starter">Starter (100 pruebas virtuales IA/mes) - Gratuito</option>
                <option value="Pro">Pro (300 pruebas virtuales IA/mes) - Popular</option>
                <option value="Enterprise">Enterprise (Pruebas IA Ilimitadas)</option>
              </select>
            </div>

            <div id="admin-register-error" class="auth-error-box" style="display:none"></div>

            <button type="submit" class="auth-btn-primary" id="btn-register-submit">
              Crear Mi Tienda
            </button>
          </form>

          <p class="auth-switch-text">
            ¿Ya tenés cuenta? <button type="button" class="auth-switch-btn" onclick="AdminPanel.setPortalTab('login')">Iniciar sesión</button>
          </p>

          <div class="auth-card-footer">
            <p class="auth-footer-copy">© 2026 CAPFIT. Todos los derechos reservados.</p>
            <div class="auth-footer-links">
              <a href="javascript:void(0)" onclick="AdminPanel.showTermsModal()">Términos de Servicio</a>
              <span class="auth-footer-sep">|</span>
              <a href="javascript:void(0)" onclick="AdminPanel.showPrivacyModal()">Política de Privacidad</a>
            </div>
          </div>
        `}

      </div>

      <div style="text-align:center;margin-top:14px">
        <button type="button" onclick="navigateToView('inicio')" style="background:none;border:none;color:#64748b;font-size:0.85rem;cursor:pointer;text-decoration:none">
          ← Volver a la tienda
        </button>
      </div>
    `;
  }

  function syncSubdomainSuggestion(storeName) {
    const subdomInput = document.getElementById('reg-store-subdomain');
    if (!subdomInput) return;
    const clean = (storeName || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    subdomInput.value = clean;
    updateSubdomainPreview(clean);
  }

  function updateSubdomainPreview(val) {
    const prev = document.getElementById('subdomain-live-preview');
    if (!prev) return;
    const clean = (val || 'tu-tienda').toLowerCase().replace(/[^a-z0-9-]/g, '');
    prev.innerHTML = `URL de tus clientes: <strong>https://${clean || 'tu-tienda'}.capfit.store</strong>`;
  }

  function submitFirebaseEmailLogin() {
    const emailEl = document.getElementById('admin-email-input');
    const passEl = document.getElementById('admin-pass-input');
    const email = emailEl ? emailEl.value.trim() : '';
    const pass = passEl ? passEl.value.trim() : '';
    loginWithFirebaseEmail(email, pass);
  }

  function renderMetrics() {
    const metricsWrap = document.getElementById('admin-metrics-row');
    if (!metricsWrap) return;

    const m = getMetrics();
    const quota = _aiQuota || { used: 0, limit: 100, remaining: 100, percentUsed: 0, period: '2026-09' };
    const quotaPercent = Math.min(100, Math.round((quota.used / (quota.limit || 100)) * 100));
    const isQuotaExhausted = quota.used >= quota.limit;
    const isQuotaWarning = quotaPercent >= 80 && !isQuotaExhausted;

    let progressBarClass = '';
    if (isQuotaExhausted) progressBarClass = 'danger';
    else if (isQuotaWarning) progressBarClass = 'warning';

    metricsWrap.innerHTML = `
      <!-- AI Quota Card -->
      <div class="admin-quota-card">
        <div class="quota-card-header">
          <div class="quota-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#10b981"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Consumo Mensual de IA (Probador Virtual)</span>
          </div>
          <span class="saas-badge-plan">${quota.plan || 'Plan Standard'}</span>
        </div>

        <div style="display:flex;align-items:baseline;justify-content:space-between">
          <div style="font-size:1.6rem;font-weight:800;color:var(--gray-900)">
            ${quota.used} <span style="font-size:0.9rem;font-weight:600;color:var(--gray-500)">/ ${quota.limit} fotos generadas</span>
          </div>
          <div style="font-weight:700;font-size:0.88rem;color:${isQuotaExhausted ? '#dc2626' : (isQuotaWarning ? '#d97706' : '#059669')}">
            ${isQuotaExhausted ? '¡Cupo mensual alcanzado!' : `${quota.remaining} disponibles este mes`}
          </div>
        </div>

        <div class="quota-progress-track">
          <div class="quota-progress-bar ${progressBarClass}" style="width: ${quotaPercent}%"></div>
        </div>

        <div class="quota-card-footer">
          <span>📅 Período: Septiembre 2026 · Se reinicia el 1° de Octubre</span>
          ${_adminRole === 'superadmin' ? `
            <button class="admin-btn-sec-sm" onclick="AdminPanel.openEditStoreQuotaModal('${_currentStoreId}')" style="padding:2px 8px;font-size:0.72rem">
              ⚙️ Ajustar Límite / Reiniciar Mes
            </button>
          ` : `
            <span style="color:var(--gray-500)">Cada imagen generada descuenta 1 uso</span>
          `}
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="stat-icon-wrap green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Ventas Cobradas</span>
          <strong class="stat-val">${formatPrecio(m.totalVentas)}</strong>
          <span class="stat-hint">Total en pedidos aprobados</span>
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="stat-icon-wrap blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Por Despachar</span>
          <strong class="stat-val ${m.pendingShipping > 0 ? 'highlight-alert' : ''}">${m.pendingShipping} <small>pedidos</small></strong>
          <span class="stat-hint">${m.totalOrders} pedidos totales</span>
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="stat-icon-wrap dark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Catálogo Activo</span>
          <strong class="stat-val">${m.totalProducts} <small>modelos</small></strong>
          <span class="stat-hint">Gorras de esta tienda</span>
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="stat-icon-wrap ${m.lowStockCount > 0 ? 'orange' : 'green'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <div class="stat-info">
          <span class="stat-label">Stock Crítico (≤ 5)</span>
          <strong class="stat-val ${m.lowStockCount > 0 ? 'highlight-warning' : ''}">${m.lowStockCount} <small>artículos</small></strong>
          <span class="stat-hint">${m.lowStockCount > 0 ? 'Requieren reposición' : 'Inventario en orden'}</span>
        </div>
      </div>
    `;
  }

  function switchActiveStore(storeId) {
    _currentStoreId = storeId;
    sessionStorage.setItem(STORE_ID_KEY, storeId);
    if (window.Store && Store.switchStore) {
      // Sincroniza localmente sin recargar si es admin
    }
    refreshData();
  }

  function renderDashboard() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const isSuper = _adminRole === 'superadmin';

    container.innerHTML = `
      <!-- Admin Top Navigation Bar -->
      <div class="admin-topbar">
        <div class="admin-topbar-left">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="admin-badge-status">
              <span class="pulse-dot"></span>
              ${isSuper ? '👑 SuperAdmin SaaS' : '🏪 Dueño de Tienda'}
            </div>
            <span style="background:#0f172a;color:#38bdf8;font-size:0.72rem;padding:3px 8px;border-radius:6px;font-family:monospace;font-weight:700" title="Portal de Configuración de Dueños">
              account.capfit.store
            </span>
            <span class="saas-store-domain" title="Subdominio público de tus clientes">${_currentSubdomain}.capfit.store</span>
            <span style="display:inline-flex;align-items:center;gap:4px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:0.72rem;padding:3px 8px;border-radius:999px;font-weight:600" title="Base de Datos Cloud Firebase Firestore & Auth Activos">
              🔥 Firebase Firestore & Auth
            </span>
            ${_userEmail ? `
              <span style="display:inline-flex;align-items:center;gap:4px;background:#f8fafc;border:1px solid #e2e8f0;color:#475569;font-size:0.72rem;padding:3px 8px;border-radius:6px;font-weight:600">
                👤 ${_userEmail}
              </span>
            ` : ''}
          </div>
          <h2 class="admin-main-heading">${_currentStoreName}</h2>
        </div>

        <div class="admin-topbar-actions">
          ${isSuper && _allStores.length > 1 ? `
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:0.75rem;color:var(--gray-500);font-weight:600">Tienda:</span>
              <select class="admin-select-status" style="font-size:0.8rem;padding:6px 10px" onchange="AdminPanel.switchActiveStore(this.value)">
                ${_allStores.map(s => `
                  <option value="${s.id}" ${s.id === _currentStoreId ? 'selected' : ''}>${s.name} (${s.subdomain})</option>
                `).join('')}
              </select>
            </div>
          ` : ''}

          <button class="admin-btn-sec" onclick="AdminPanel.openNewProductModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nueva Gorra
          </button>
          <button class="admin-btn-sec" onclick="AdminPanel.refreshData()" title="Actualizar datos">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refrescar
          </button>
          <button class="admin-btn-outline" onclick="Store.switchStore('${_currentStoreId}')" title="Ver la tienda como cliente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Ver Tienda
          </button>
          <button class="admin-btn-danger-outline" onclick="AdminPanel.logout()" title="Cerrar sesión">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Salir
          </button>
        </div>
      </div>

      <!-- KPI Metrics Overview -->
      <div id="admin-metrics-row" class="admin-metrics-grid"></div>

      <!-- Tabs Header -->
      <div class="admin-tabs-nav">
        <button class="admin-tab-btn ${_activeTab === 'catalogo' ? 'active' : ''}" onclick="AdminPanel.switchTab('catalogo')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
          Catálogo & Stock
          <span class="tab-badge">${_products.length}</span>
        </button>
        <button class="admin-tab-btn ${_activeTab === 'pedidos' ? 'active' : ''}" onclick="AdminPanel.switchTab('pedidos')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          Pedidos & Envíos
          <span class="tab-badge">${_orders.length}</span>
        </button>
        <button class="admin-tab-btn ${_activeTab === 'nuevo' ? 'active' : ''}" onclick="AdminPanel.switchTab('nuevo')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Cargar Nueva Gorra
        </button>
        <button class="admin-tab-btn ${_activeTab === 'secciones' ? 'active' : ''}" onclick="AdminPanel.switchTab('secciones')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Páginas & Secciones
        </button>
        ${isSuper ? `
          <button class="admin-tab-btn ${_activeTab === 'tiendas' ? 'active' : ''}" onclick="AdminPanel.switchTab('tiendas')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Red de Tiendas (SaaS)
            <span class="tab-badge">${_allStores.length}</span>
          </button>
        ` : ''}
      </div>

      <!-- Tab Content Area -->
      <div id="admin-tab-content-area" class="admin-tab-content-wrap"></div>
    `;

    renderMetrics();
    renderActiveTabContent();
  }

  function renderActiveTabContent() {
    const tabArea = document.getElementById('admin-tab-content-area');
    if (!tabArea) return;

    if (_activeTab === 'catalogo') {
      renderCatalogTab(tabArea);
    } else if (_activeTab === 'pedidos') {
      renderOrdersTab(tabArea);
    } else if (_activeTab === 'nuevo') {
      renderNewProductTab(tabArea);
    } else if (_activeTab === 'secciones') {
      renderSectionsTab(tabArea);
    } else if (_activeTab === 'tiendas') {
      renderStoresTab(tabArea);
    }
  }

  // ── TAB: PÁGINAS & SECCIONES PERSONALIZABLES (MULTI-TENANT FIRESTORE) ──
  function switchSectionSubtab(subtab) {
    _activeSectionSubtab = subtab;
    const tabArea = document.getElementById('admin-tab-content-area');
    if (tabArea) renderSectionsTab(tabArea);
  }

  function openSectionsEditor(sectionKey) {
    _activeTab = 'secciones';
    if (sectionKey) _activeSectionSubtab = sectionKey;
    render();
    const tabArea = document.getElementById('admin-tab-content-area');
    if (tabArea) {
      tabArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderSectionsTab(container) {
    const subtabs = [
      { key: 'home', label: '🏠 Portada & Inicio', view: 'inicio' },
      { key: 'about', label: 'ℹ️ Sobre Nosotros', view: 'sobre-nosotros' },
      { key: 'faq', label: '❓ Preguntas Frecuentes', view: 'faq' },
      { key: 'envios', label: '🚚 Envíos & Entregas', view: 'envios' },
      { key: 'cambios', label: '🔄 Cambios & Devoluciones', view: 'cambios' },
      { key: 'contacto', label: '📞 Contacto & Showroom', view: 'contacto' },
      { key: 'terminos', label: '📜 Términos & Condiciones', view: 'terminos' },
      { key: 'privacidad', label: '🔒 Política de Privacidad', view: 'privacidad' }
    ];

    const currentSub = subtabs.find(s => s.key === _activeSectionSubtab) || subtabs[0];
    const allSections = (window.PagesManager && PagesManager.getSections) ? PagesManager.getSections(_currentStoreId) : {};
    const d = allSections[currentSub.key] || {};

    container.innerHTML = `
      <!-- Header Banner -->
      <div style="background:#0f172a;border-radius:12px;padding:20px;color:#fff;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="background:#38bdf8;color:#0f172a;font-size:0.75rem;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:0.5px">
              Personalizador de Tienda
            </span>
            <span style="color:#94a3b8;font-size:0.82rem">Tienda activa: <strong>${escapeHtml(_currentStoreName)}</strong> (${escapeHtml(_currentStoreId)})</span>
          </div>
          <h3 style="margin:0;font-size:1.3rem;font-weight:800;color:#fff">Edición de Páginas y Secciones de la Tienda</h3>
          <p style="margin:4px 0 0;font-size:0.85rem;color:#cbd5e1">Personalizá portada, hero, textos, anuncios y páginas informativas. Se guardan en la nube y se reflejan al instante.</p>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button type="button" class="admin-btn-sec" onclick="navigateToView('${currentSub.view}')" style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.25)">
            👁️ Ver "${currentSub.label.replace(/^[^\s]+\s/, '')}" en Tienda
          </button>
        </div>
      </div>

      <!-- Navigation Subtabs -->
      <div class="section-editor-subtabs-nav">
        ${subtabs.map(st => `
          <button type="button" class="section-editor-subtab-btn ${st.key === currentSub.key ? 'active' : ''}" onclick="AdminPanel.switchSectionSubtab('${st.key}')">
            ${st.label}
          </button>
        `).join('')}
      </div>

      <!-- Active Section Form Box -->
      <div class="admin-card" style="background:#fff;border:1px solid var(--gray-200);border-radius:12px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.03)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--gray-200);flex-wrap:wrap;gap:10px">
          <div>
            <h4 style="margin:0;font-size:1.15rem;font-weight:700;color:var(--gray-900)">
              ${currentSub.label}
            </h4>
            <span style="font-size:0.8rem;color:var(--gray-500)">Modificá los textos y parámetros de esta sección para tu tienda.</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="background:#f1f5f9;color:#475569;font-size:0.75rem;padding:4px 10px;border-radius:20px;font-family:monospace;font-weight:600">
              /stores/${escapeHtml(_currentStoreId)}/sections/${currentSub.key}
            </span>
          </div>
        </div>

        <form id="form-admin-section-${currentSub.key}" onsubmit="AdminPanel.saveCurrentSectionForm(event)">
          ${renderSectionFormFields(currentSub.key, d)}

          <div class="section-editor-footer">
            <button type="button" class="admin-btn-outline" onclick="AdminPanel.resetCurrentSectionForm()" style="color:var(--gray-600)">
              ↺ Restaurar Valores por Defecto
            </button>
            <div style="display:flex;align-items:center;gap:12px">
              <button type="button" class="admin-btn-sec" onclick="navigateToView('${currentSub.view}')">
                👁️ Vista Previa
              </button>
              <button type="submit" class="admin-btn-primary" id="btn-save-section-submit" style="display:inline-flex;align-items:center;gap:8px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                <span>Guardar en Firebase Firestore</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    `;
  }

  function renderSectionFormFields(key, d) {
    if (key === 'home') {
      return `
        <div class="section-form-grid">
          <!-- Portada Hero -->
          <div class="full-width" style="margin-top:4px;margin-bottom:8px">
            <div style="font-weight:700;font-size:0.95rem;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:6px">
              🎯 Portada & Hero Principal
            </div>
          </div>
          
          <div class="full-width">
            <label class="admin-label">Título Principal (H1) <span style="font-weight:400;color:var(--gray-500);font-size:0.8rem">(usá Enter para saltos de línea)</span></label>
            <textarea id="sec-input-heroTitle" class="admin-textarea" rows="2" placeholder="Probátela.&#10;Comprá con confianza.">${escapeHtml(d.heroTitle || 'Probátela.\nComprá con confianza.')}</textarea>
          </div>

          <div class="full-width">
            <label class="admin-label">Subtítulo / Bajada del Hero</label>
            <input type="text" id="sec-input-heroSubtitle" class="admin-input" value="${escapeHtml(d.heroSubtitle || 'Usá IA para verte con tus gorras favoritas antes de comprarlas.')}">
          </div>

          <div>
            <label class="admin-label">Texto del Botón Principal (CTA)</label>
            <input type="text" id="sec-input-heroCtaPrimary" class="admin-input" value="${escapeHtml(d.heroCtaPrimary || 'PROBAR AHORA →')}">
          </div>

          <div>
            <label class="admin-label">Prueba Social (+ Usuarios que probaron)</label>
            <input type="text" id="sec-input-heroProofCount" class="admin-input" value="${escapeHtml(d.heroProofCount || '+3.500 personas ya probaron')}">
          </div>

          <div class="full-width">
            <label class="admin-label">Calificación y Reseñas</label>
            <input type="text" id="sec-input-heroRatingText" class="admin-input" value="${escapeHtml(d.heroRatingText || '★★★★★ 4.9 (327 opiniones)')}">
          </div>

          <!-- Barra superior de anuncios -->
          <div class="full-width" style="margin-top:16px;margin-bottom:8px">
            <div style="font-weight:700;font-size:0.95rem;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:6px;display:flex;align-items:center;justify-content:space-between">
              <span>📢 Barra Superior de Anuncios</span>
              <label style="font-size:0.82rem;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer">
                <input type="checkbox" id="sec-input-announcementActive" ${d.announcementActive !== false ? 'checked' : ''}> Mostrar barra
              </label>
            </div>
          </div>

          <div class="full-width">
            <label class="admin-label">Anuncio 1 (Izquierda)</label>
            <input type="text" id="sec-input-announcementText1" class="admin-input" value="${escapeHtml(d.announcementText1 || 'Envío gratis en compras mayores a $39.999')}">
          </div>

          <div>
            <label class="admin-label">Anuncio 2 (Centro)</label>
            <input type="text" id="sec-input-announcementText2" class="admin-input" value="${escapeHtml(d.announcementText2 || '30 días para cambios y devoluciones')}">
          </div>

          <div>
            <label class="admin-label">Anuncio 3 (Derecha)</label>
            <input type="text" id="sec-input-announcementText3" class="admin-input" value="${escapeHtml(d.announcementText3 || '¿Necesitás ayuda? Escribinos por WhatsApp')}">
          </div>

          <!-- Beneficios / Tarjetas de confianza -->
          <div class="full-width" style="margin-top:16px;margin-bottom:8px">
            <div style="font-weight:700;font-size:0.95rem;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:6px">
              🛡️ Tarjetas de Confianza & Beneficios
            </div>
          </div>

          <div>
            <label class="admin-label">Beneficio 1: Título</label>
            <input type="text" id="sec-input-trust1Title" class="admin-input" value="${escapeHtml(d.trust1Title || 'Probá en 3 pasos')}">
          </div>
          <div>
            <label class="admin-label">Beneficio 1: Descripción</label>
            <input type="text" id="sec-input-trust1Desc" class="admin-input" value="${escapeHtml(d.trust1Desc || 'Elegí, subí tu foto y mirá el resultado.')}">
          </div>

          <div>
            <label class="admin-label">Beneficio 2: Título</label>
            <input type="text" id="sec-input-trust2Title" class="admin-input" value="${escapeHtml(d.trust2Title || 'Envíos a todo el país')}">
          </div>
          <div>
            <label class="admin-label">Beneficio 2: Descripción</label>
            <input type="text" id="sec-input-trust2Desc" class="admin-input" value="${escapeHtml(d.trust2Desc || 'Envío gratis en compras mayores a $39.999.')}">
          </div>

          <div>
            <label class="admin-label">Beneficio 3: Título</label>
            <input type="text" id="sec-input-trust3Title" class="admin-input" value="${escapeHtml(d.trust3Title || '30 días para cambios')}">
          </div>
          <div>
            <label class="admin-label">Beneficio 3: Descripción</label>
            <input type="text" id="sec-input-trust3Desc" class="admin-input" value="${escapeHtml(d.trust3Desc || 'Si no te convence, lo cambiás sin problema.')}">
          </div>

          <div>
            <label class="admin-label">Beneficio 4: Título</label>
            <input type="text" id="sec-input-trust4Title" class="admin-input" value="${escapeHtml(d.trust4Title || 'Compra 100% segura')}">
          </div>
          <div>
            <label class="admin-label">Beneficio 4: Descripción</label>
            <input type="text" id="sec-input-trust4Desc" class="admin-input" value="${escapeHtml(d.trust4Desc || 'Tus datos están protegidos siempre.')}">
          </div>

          <!-- Catálogo -->
          <div class="full-width" style="margin-top:16px;margin-bottom:8px">
            <div style="font-weight:700;font-size:0.95rem;color:#0f172a;border-bottom:2px solid #e2e8f0;padding-bottom:6px">
              🧢 Sección Catálogo
            </div>
          </div>

          <div class="full-width">
            <label class="admin-label">Título de la Sección de Catálogo</label>
            <input type="text" id="sec-input-catalogHeadline" class="admin-input" value="${escapeHtml(d.catalogHeadline || 'Gorras más vendidas')}">
          </div>
        </div>
      `;
    }

    if (key === 'about') {
      return `
        <div class="section-form-grid">
          <div>
            <label class="admin-label">Nombre de la Marca / Tienda</label>
            <input type="text" id="sec-input-brandName" class="admin-input" value="${escapeHtml(d.brandName || _currentStoreName)}" required>
          </div>
          <div>
            <label class="admin-label">Año de Fundación</label>
            <input type="text" id="sec-input-foundedYear" class="admin-input" value="${escapeHtml(d.foundedYear || '2024')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Lema / Subtítulo Principal</label>
            <input type="text" id="sec-input-tagline" class="admin-input" value="${escapeHtml(d.tagline || '')}" placeholder="Probadores virtuales de gorras y accesorios con IA...">
          </div>
          <div class="full-width">
            <label class="admin-label">Nuestra Historia</label>
            <textarea id="sec-input-story" class="admin-textarea" rows="4" placeholder="Contá el origen y la pasión de tu marca...">${escapeHtml(d.story || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Nuestra Misión</label>
            <textarea id="sec-input-mission" class="admin-textarea" rows="3">${escapeHtml(d.mission || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Nuestra Visión</label>
            <textarea id="sec-input-vision" class="admin-textarea" rows="3">${escapeHtml(d.vision || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Compromiso con la Calidad</label>
            <textarea id="sec-input-quality" class="admin-textarea" rows="2">${escapeHtml(d.quality || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Ubicación / Ciudad</label>
            <input type="text" id="sec-input-location" class="admin-input" value="${escapeHtml(d.location || '')}">
          </div>
          <div>
            <label class="admin-label">Email de Contacto</label>
            <input type="email" id="sec-input-email" class="admin-input" value="${escapeHtml(d.email || '')}">
          </div>
          <div>
            <label class="admin-label">Teléfono / WhatsApp</label>
            <input type="text" id="sec-input-phone" class="admin-input" value="${escapeHtml(d.phone || '')}">
          </div>
          <div>
            <label class="admin-label">Estadística: Clientes Felices</label>
            <input type="text" id="sec-input-statsHappyClients" class="admin-input" value="${escapeHtml(d.statsHappyClients || '+3.500')}">
          </div>
          <div>
            <label class="admin-label">Estadística: Calce / Precisión IA</label>
            <input type="text" id="sec-input-statsTryonAccuracy" class="admin-input" value="${escapeHtml(d.statsTryonAccuracy || '99.2%')}">
          </div>
          <div>
            <label class="admin-label">Estadística: Tiempo de Entrega</label>
            <input type="text" id="sec-input-statsFastShipping" class="admin-input" value="${escapeHtml(d.statsFastShipping || '24-48 hs')}">
          </div>
        </div>
      `;
    }

    if (key === 'faq') {
      const items = Array.isArray(d.items) ? d.items : [];
      return `
        <div class="section-form-grid">
          <div class="full-width">
            <label class="admin-label">Subtítulo de la Página FAQ</label>
            <input type="text" id="sec-input-subtitle" class="admin-input" value="${escapeHtml(d.subtitle || '')}">
          </div>
          <div class="full-width" style="margin-top:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <label class="admin-label" style="margin:0;font-size:0.95rem;font-weight:700">Listado de Preguntas y Respuestas</label>
              <button type="button" class="admin-btn-sec" onclick="AdminPanel.addFaqItemRow()" style="padding:6px 12px;font-size:0.8rem">
                + Agregar Pregunta
              </button>
            </div>
            <div id="faq-admin-items-list" style="display:flex;flex-direction:column;gap:12px">
              ${items.map((item, i) => `
                <div class="faq-admin-row-card" id="faq-row-${i}" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;position:relative">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                    <span style="font-weight:700;font-size:0.82rem;color:#475569">Pregunta #${i + 1}</span>
                    <button type="button" onclick="AdminPanel.removeFaqItemRow(${i})" style="background:none;border:none;color:#ef4444;font-size:0.8rem;cursor:pointer;font-weight:600">
                      🗑️ Eliminar
                    </button>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 140px;gap:10px;margin-bottom:8px">
                    <input type="text" class="admin-input faq-field-q" value="${escapeHtml(item.q || '')}" placeholder="¿Pregunta frecuente?" required>
                    <select class="admin-input faq-field-cat">
                      <option value="ia" ${item.cat === 'ia' ? 'selected' : ''}>🤖 Probador IA</option>
                      <option value="envios" ${item.cat === 'envios' ? 'selected' : ''}>🚚 Envíos</option>
                      <option value="pagos" ${item.cat === 'pagos' ? 'selected' : ''}>💳 Pagos</option>
                      <option value="garantia" ${item.cat === 'garantia' ? 'selected' : ''}>🛡️ Garantía</option>
                    </select>
                  </div>
                  <textarea class="admin-textarea faq-field-a" rows="2" placeholder="Respuesta clara y detallada..." required>${escapeHtml(item.a || '')}</textarea>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    if (key === 'envios') {
      return `
        <div class="section-form-grid">
          <div>
            <label class="admin-label">Monto Mínimo para Envío Gratis ($ ARS)</label>
            <input type="number" id="sec-input-freeShippingThreshold" class="admin-input" value="${Number(d.freeShippingThreshold || 40000)}">
          </div>
          <div class="full-width">
            <label class="admin-label">Texto del Banner Promocional de Envío</label>
            <input type="text" id="sec-input-freeShippingBanner" class="admin-input" value="${escapeHtml(d.freeShippingBanner || '')}">
          </div>
          <div>
            <label class="admin-label">Título: Envío Estándar</label>
            <input type="text" id="sec-input-standardTitle" class="admin-input" value="${escapeHtml(d.standardTitle || 'Envío Estándar Nacional')}">
          </div>
          <div>
            <label class="admin-label">Plazo: Envío Estándar</label>
            <input type="text" id="sec-input-standardTime" class="admin-input" value="${escapeHtml(d.standardTime || '3 a 5 días hábiles')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Descripción / Transportista Estándar</label>
            <textarea id="sec-input-standardCarrier" class="admin-textarea" rows="2">${escapeHtml(d.standardCarrier || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Título: Envío Express</label>
            <input type="text" id="sec-input-expressTitle" class="admin-input" value="${escapeHtml(d.expressTitle || 'Express CABA y GBA')}">
          </div>
          <div>
            <label class="admin-label">Plazo: Envío Express</label>
            <input type="text" id="sec-input-expressTime" class="admin-input" value="${escapeHtml(d.expressTime || '24 a 48 hs hábiles')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Descripción Envío Express</label>
            <textarea id="sec-input-expressDesc" class="admin-textarea" rows="2">${escapeHtml(d.expressDesc || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Título: Retiro en Sucursal / Showroom</label>
            <input type="text" id="sec-input-pickupTitle" class="admin-input" value="${escapeHtml(d.pickupTitle || 'Retiro en Sucursal / Showroom')}">
          </div>
          <div>
            <label class="admin-label">Plazo / Costo de Retiro</label>
            <input type="text" id="sec-input-pickupTime" class="admin-input" value="${escapeHtml(d.pickupTime || 'Gratis / Inmediato')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Dirección para Retiro</label>
            <input type="text" id="sec-input-pickupAddress" class="admin-input" value="${escapeHtml(d.pickupAddress || '')}">
          </div>
          <div>
            <label class="admin-label">Título: Garantía de Embalaje</label>
            <input type="text" id="sec-input-packagingTitle" class="admin-input" value="${escapeHtml(d.packagingTitle || 'Embalaje Protector Reforzado')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Descripción del Embalaje</label>
            <textarea id="sec-input-packagingDesc" class="admin-textarea" rows="2">${escapeHtml(d.packagingDesc || '')}</textarea>
          </div>
        </div>
      `;
    }

    if (key === 'cambios') {
      return `
        <div class="section-form-grid">
          <div>
            <label class="admin-label">Días de Garantía</label>
            <input type="number" id="sec-input-daysGuarantee" class="admin-input" value="${Number(d.daysGuarantee || 30)}">
          </div>
          <div>
            <label class="admin-label">WhatsApp para Cambios</label>
            <input type="text" id="sec-input-whatsappNumber" class="admin-input" value="${escapeHtml(d.whatsappNumber || '')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Título del Banner Principal</label>
            <input type="text" id="sec-input-bannerTitle" class="admin-input" value="${escapeHtml(d.bannerTitle || '')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Descripción del Banner</label>
            <textarea id="sec-input-bannerDesc" class="admin-textarea" rows="2">${escapeHtml(d.bannerDesc || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Paso 1: Título</label>
            <input type="text" id="sec-input-step1Title" class="admin-input" value="${escapeHtml(d.step1Title || 'Contactanos')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Paso 1: Descripción</label>
            <textarea id="sec-input-step1Desc" class="admin-textarea" rows="2">${escapeHtml(d.step1Desc || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Paso 2: Título</label>
            <input type="text" id="sec-input-step2Title" class="admin-input" value="${escapeHtml(d.step2Title || 'Despachá el Paquete')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Paso 2: Descripción</label>
            <textarea id="sec-input-step2Desc" class="admin-textarea" rows="2">${escapeHtml(d.step2Desc || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Paso 3: Título</label>
            <input type="text" id="sec-input-step3Title" class="admin-input" value="${escapeHtml(d.step3Title || 'Recibí o Reintegrá')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Paso 3: Descripción</label>
            <textarea id="sec-input-step3Desc" class="admin-textarea" rows="2">${escapeHtml(d.step3Desc || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Condición 1</label>
            <input type="text" id="sec-input-cond1" class="admin-input" value="${escapeHtml(d.cond1 || '')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Condición 2</label>
            <input type="text" id="sec-input-cond2" class="admin-input" value="${escapeHtml(d.cond2 || '')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Condición 3</label>
            <input type="text" id="sec-input-cond3" class="admin-input" value="${escapeHtml(d.cond3 || '')}">
          </div>
        </div>
      `;
    }

    if (key === 'contacto') {
      return `
        <div class="section-form-grid">
          <div>
            <label class="admin-label">Título del Encabezado</label>
            <input type="text" id="sec-input-headerTitle" class="admin-input" value="${escapeHtml(d.headerTitle || 'Contactanos')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Subtítulo del Encabezado</label>
            <textarea id="sec-input-headerSubtitle" class="admin-textarea" rows="2">${escapeHtml(d.headerSubtitle || '')}</textarea>
          </div>
          <div>
            <label class="admin-label">Número de WhatsApp</label>
            <input type="text" id="sec-input-whatsapp" class="admin-input" value="${escapeHtml(d.whatsapp || '')}">
          </div>
          <div>
            <label class="admin-label">Aclaración WhatsApp</label>
            <input type="text" id="sec-input-whatsappDesc" class="admin-input" value="${escapeHtml(d.whatsappDesc || 'Respuesta rápida')}">
          </div>
          <div>
            <label class="admin-label">Email de Contacto</label>
            <input type="email" id="sec-input-email" class="admin-input" value="${escapeHtml(d.email || '')}">
          </div>
          <div>
            <label class="admin-label">Aclaración Email</label>
            <input type="text" id="sec-input-emailDesc" class="admin-input" value="${escapeHtml(d.emailDesc || 'Para consultas generales')}">
          </div>
          <div>
            <label class="admin-label">Título: Horarios de Atención</label>
            <input type="text" id="sec-input-hoursTitle" class="admin-input" value="${escapeHtml(d.hoursTitle || 'Horarios de Atención')}">
          </div>
          <div>
            <label class="admin-label">Detalle Horarios</label>
            <input type="text" id="sec-input-hoursDesc" class="admin-input" value="${escapeHtml(d.hoursDesc || 'Lunes a Sábados de 9:00 a 20:00 hs')}">
          </div>
          <div>
            <label class="admin-label">Título: Punto de Entrega / Showroom</label>
            <input type="text" id="sec-input-locationTitle" class="admin-input" value="${escapeHtml(d.locationTitle || 'Punto de Entrega & Showroom')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Dirección o Aclaración Showroom</label>
            <input type="text" id="sec-input-locationDesc" class="admin-input" value="${escapeHtml(d.locationDesc || '')}">
          </div>
        </div>
      `;
    }

    if (key === 'terminos') {
      return `
        <div class="section-form-grid">
          <div>
            <label class="admin-label">Fecha de Última Actualización</label>
            <input type="text" id="sec-input-lastUpdated" class="admin-input" value="${escapeHtml(d.lastUpdated || 'Enero 2026')}">
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 1: Título</label>
            <input type="text" id="sec-input-art1Title" class="admin-input" value="${escapeHtml(d.art1Title || '1. Aceptación de los Términos')}">
            <label class="admin-label" style="margin-top:6px">Artículo 1: Contenido</label>
            <textarea id="sec-input-art1Body" class="admin-textarea" rows="3">${escapeHtml(d.art1Body || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 2: Título</label>
            <input type="text" id="sec-input-art2Title" class="admin-input" value="${escapeHtml(d.art2Title || '2. Uso del Probador Virtual con IA')}">
            <label class="admin-label" style="margin-top:6px">Artículo 2: Contenido</label>
            <textarea id="sec-input-art2Body" class="admin-textarea" rows="3">${escapeHtml(d.art2Body || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 3: Título</label>
            <input type="text" id="sec-input-art3Title" class="admin-input" value="${escapeHtml(d.art3Title || '3. Precios y Moneda')}">
            <label class="admin-label" style="margin-top:6px">Artículo 3: Contenido</label>
            <textarea id="sec-input-art3Body" class="admin-textarea" rows="3">${escapeHtml(d.art3Body || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 4: Título</label>
            <input type="text" id="sec-input-art4Title" class="admin-input" value="${escapeHtml(d.art4Title || '4. Disponibilidad y Despacho')}">
            <label class="admin-label" style="margin-top:6px">Artículo 4: Contenido</label>
            <textarea id="sec-input-art4Body" class="admin-textarea" rows="3">${escapeHtml(d.art4Body || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 5: Título</label>
            <input type="text" id="sec-input-art5Title" class="admin-input" value="${escapeHtml(d.art5Title || '5. Propiedad Intelectual')}">
            <label class="admin-label" style="margin-top:6px">Artículo 5: Contenido</label>
            <textarea id="sec-input-art5Body" class="admin-textarea" rows="3">${escapeHtml(d.art5Body || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 6: Título</label>
            <input type="text" id="sec-input-art6Title" class="admin-input" value="${escapeHtml(d.art6Title || '6. Jurisdicción y Ley Aplicable')}">
            <label class="admin-label" style="margin-top:6px">Artículo 6: Contenido</label>
            <textarea id="sec-input-art6Body" class="admin-textarea" rows="3">${escapeHtml(d.art6Body || '')}</textarea>
          </div>
        </div>
      `;
    }

    if (key === 'privacidad') {
      return `
        <div class="section-form-grid">
          <div class="full-width">
            <label class="admin-label">Artículo 1: Título</label>
            <input type="text" id="sec-input-art1Title" class="admin-input" value="${escapeHtml(d.art1Title || '1. Privacidad por Diseño en el Probador Virtual')}">
            <label class="admin-label" style="margin-top:6px">Artículo 1: Contenido</label>
            <textarea id="sec-input-art1Body" class="admin-textarea" rows="3">${escapeHtml(d.art1Body || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 2: Título</label>
            <input type="text" id="sec-input-art2Title" class="admin-input" value="${escapeHtml(d.art2Title || '2. Datos Recopilados en el Proceso de Compra')}">
            <label class="admin-label" style="margin-top:6px">Artículo 2: Contenido</label>
            <textarea id="sec-input-art2Body" class="admin-textarea" rows="3">${escapeHtml(d.art2Body || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 3: Título</label>
            <input type="text" id="sec-input-art3Title" class="admin-input" value="${escapeHtml(d.art3Title || '3. Seguridad de Pagos')}">
            <label class="admin-label" style="margin-top:6px">Artículo 3: Contenido</label>
            <textarea id="sec-input-art3Body" class="admin-textarea" rows="3">${escapeHtml(d.art3Body || '')}</textarea>
          </div>
          <div class="full-width">
            <label class="admin-label">Artículo 4: Título</label>
            <input type="text" id="sec-input-art4Title" class="admin-input" value="${escapeHtml(d.art4Title || '4. Derechos del Titular de los Datos')}">
            <label class="admin-label" style="margin-top:6px">Artículo 4: Contenido</label>
            <textarea id="sec-input-art4Body" class="admin-textarea" rows="3">${escapeHtml(d.art4Body || '')}</textarea>
          </div>
        </div>
      `;
    }

    return '<p>Sección no reconocida.</p>';
  }

  function addFaqItemRow() {
    const list = document.getElementById('faq-admin-items-list');
    if (!list) return;
    const idx = list.querySelectorAll('.faq-admin-row-card').length;
    const div = document.createElement('div');
    div.className = 'faq-admin-row-card';
    div.id = `faq-row-${idx}`;
    div.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;position:relative';
    div.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-weight:700;font-size:0.82rem;color:#475569">Nueva Pregunta #${idx + 1}</span>
        <button type="button" onclick="AdminPanel.removeFaqItemRow(${idx})" style="background:none;border:none;color:#ef4444;font-size:0.8rem;cursor:pointer;font-weight:600">
          🗑️ Eliminar
        </button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 140px;gap:10px;margin-bottom:8px">
        <input type="text" class="admin-input faq-field-q" placeholder="¿Pregunta frecuente?" required>
        <select class="admin-input faq-field-cat">
          <option value="ia">🤖 Probador IA</option>
          <option value="envios">🚚 Envíos</option>
          <option value="pagos">💳 Pagos</option>
          <option value="garantia">🛡️ Garantía</option>
        </select>
      </div>
      <textarea class="admin-textarea faq-field-a" rows="2" placeholder="Respuesta clara y detallada..." required></textarea>
    `;
    list.appendChild(div);
  }

  function removeFaqItemRow(index) {
    const row = document.getElementById(`faq-row-${index}`);
    if (row) row.remove();
  }

  async function saveCurrentSectionForm(e) {
    if (e) e.preventDefault();
    const key = _activeSectionSubtab;
    const btn = document.getElementById('btn-save-section-submit');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span>⏳ Guardando en Firebase...</span>`;
    }

    try {
      const getVal = id => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };

      let sectionData = {};

      if (key === 'home') {
        const annCheck = document.getElementById('sec-input-announcementActive');
        sectionData = {
          heroTitle: getVal('sec-input-heroTitle'),
          heroSubtitle: getVal('sec-input-heroSubtitle'),
          heroCtaPrimary: getVal('sec-input-heroCtaPrimary'),
          heroProofCount: getVal('sec-input-heroProofCount'),
          heroRatingText: getVal('sec-input-heroRatingText'),
          announcementActive: annCheck ? annCheck.checked : true,
          announcementText1: getVal('sec-input-announcementText1'),
          announcementText2: getVal('sec-input-announcementText2'),
          announcementText3: getVal('sec-input-announcementText3'),
          trust1Title: getVal('sec-input-trust1Title'),
          trust1Desc: getVal('sec-input-trust1Desc'),
          trust2Title: getVal('sec-input-trust2Title'),
          trust2Desc: getVal('sec-input-trust2Desc'),
          trust3Title: getVal('sec-input-trust3Title'),
          trust3Desc: getVal('sec-input-trust3Desc'),
          trust4Title: getVal('sec-input-trust4Title'),
          trust4Desc: getVal('sec-input-trust4Desc'),
          catalogHeadline: getVal('sec-input-catalogHeadline')
        };
      } else if (key === 'about') {
        sectionData = {
          brandName: getVal('sec-input-brandName'),
          tagline: getVal('sec-input-tagline'),
          story: getVal('sec-input-story'),
          mission: getVal('sec-input-mission'),
          vision: getVal('sec-input-vision'),
          quality: getVal('sec-input-quality'),
          foundedYear: getVal('sec-input-foundedYear'),
          location: getVal('sec-input-location'),
          email: getVal('sec-input-email'),
          phone: getVal('sec-input-phone'),
          statsHappyClients: getVal('sec-input-statsHappyClients'),
          statsTryonAccuracy: getVal('sec-input-statsTryonAccuracy'),
          statsFastShipping: getVal('sec-input-statsFastShipping')
        };
      } else if (key === 'faq') {
        const subtitle = getVal('sec-input-subtitle');
        const rows = document.querySelectorAll('.faq-admin-row-card');
        const items = [];
        rows.forEach((r, idx) => {
          const q = r.querySelector('.faq-field-q')?.value?.trim();
          const a = r.querySelector('.faq-field-a')?.value?.trim();
          const cat = r.querySelector('.faq-field-cat')?.value || 'ia';
          if (q && a) {
            items.push({ id: `faq-${idx + 1}`, cat, q, a });
          }
        });
        sectionData = { subtitle, items };
      } else if (key === 'envios') {
        sectionData = {
          freeShippingThreshold: Number(getVal('sec-input-freeShippingThreshold')) || 40000,
          freeShippingBanner: getVal('sec-input-freeShippingBanner'),
          standardTitle: getVal('sec-input-standardTitle'),
          standardTime: getVal('sec-input-standardTime'),
          standardCarrier: getVal('sec-input-standardCarrier'),
          expressTitle: getVal('sec-input-expressTitle'),
          expressTime: getVal('sec-input-expressTime'),
          expressDesc: getVal('sec-input-expressDesc'),
          pickupTitle: getVal('sec-input-pickupTitle'),
          pickupTime: getVal('sec-input-pickupTime'),
          pickupAddress: getVal('sec-input-pickupAddress'),
          packagingTitle: getVal('sec-input-packagingTitle'),
          packagingDesc: getVal('sec-input-packagingDesc')
        };
      } else if (key === 'cambios') {
        sectionData = {
          daysGuarantee: Number(getVal('sec-input-daysGuarantee')) || 30,
          bannerTitle: getVal('sec-input-bannerTitle'),
          bannerDesc: getVal('sec-input-bannerDesc'),
          step1Title: getVal('sec-input-step1Title'),
          step1Desc: getVal('sec-input-step1Desc'),
          step2Title: getVal('sec-input-step2Title'),
          step2Desc: getVal('sec-input-step2Desc'),
          step3Title: getVal('sec-input-step3Title'),
          step3Desc: getVal('sec-input-step3Desc'),
          cond1: getVal('sec-input-cond1'),
          cond2: getVal('sec-input-cond2'),
          cond3: getVal('sec-input-cond3'),
          whatsappNumber: getVal('sec-input-whatsappNumber')
        };
      } else if (key === 'contacto') {
        sectionData = {
          headerTitle: getVal('sec-input-headerTitle'),
          headerSubtitle: getVal('sec-input-headerSubtitle'),
          whatsapp: getVal('sec-input-whatsapp'),
          whatsappDesc: getVal('sec-input-whatsappDesc'),
          email: getVal('sec-input-email'),
          emailDesc: getVal('sec-input-emailDesc'),
          hoursTitle: getVal('sec-input-hoursTitle'),
          hoursDesc: getVal('sec-input-hoursDesc'),
          locationTitle: getVal('sec-input-locationTitle'),
          locationDesc: getVal('sec-input-locationDesc')
        };
      } else if (key === 'terminos') {
        sectionData = {
          lastUpdated: getVal('sec-input-lastUpdated'),
          art1Title: getVal('sec-input-art1Title'),
          art1Body: getVal('sec-input-art1Body'),
          art2Title: getVal('sec-input-art2Title'),
          art2Body: getVal('sec-input-art2Body'),
          art3Title: getVal('sec-input-art3Title'),
          art3Body: getVal('sec-input-art3Body'),
          art4Title: getVal('sec-input-art4Title'),
          art4Body: getVal('sec-input-art4Body'),
          art5Title: getVal('sec-input-art5Title'),
          art5Body: getVal('sec-input-art5Body'),
          art6Title: getVal('sec-input-art6Title'),
          art6Body: getVal('sec-input-art6Body')
        };
      } else if (key === 'privacidad') {
        sectionData = {
          art1Title: getVal('sec-input-art1Title'),
          art1Body: getVal('sec-input-art1Body'),
          art2Title: getVal('sec-input-art2Title'),
          art2Body: getVal('sec-input-art2Body'),
          art3Title: getVal('sec-input-art3Title'),
          art3Body: getVal('sec-input-art3Body'),
          art4Title: getVal('sec-input-art4Title'),
          art4Body: getVal('sec-input-art4Body')
        };
      }

      if (window.PagesManager && PagesManager.saveSection) {
        await PagesManager.saveSection(key, sectionData, _currentStoreId);
      } else {
        await fetch(`/api/stores/${encodeURIComponent(_currentStoreId)}/sections`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionKey: key, data: sectionData })
        });
      }

      if (window.showToast) {
        window.showToast(`✅ Sección "${key}" actualizada con éxito en Firebase Firestore`);
      }
    } catch (err) {
      console.error('Error saving section:', err);
      alert('Error al guardar la sección: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
    }
  }

  function resetCurrentSectionForm() {
    if (!confirm('¿Restaurar esta sección a sus valores predeterminados?')) return;
    if (window.PagesManager && PagesManager.resetSection) {
      PagesManager.resetSection(_activeSectionSubtab, _currentStoreId);
      const tabArea = document.getElementById('admin-tab-content-area');
      if (tabArea) renderSectionsTab(tabArea);
    }
  }

  // ── TAB 4: SAAS MULTI-TENANT STORES MANAGER (SUPERADMIN) ──
  function renderStoresTab(container) {
    container.innerHTML = `
      <!-- Cloud Database Banner -->
      <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:10px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:1.4rem">🔥</span>
          <div>
            <div style="font-size:0.86rem;font-weight:700;color:#065f46;display:flex;align-items:center;gap:8px">
              <span>Base de Datos Global: Firebase Firestore</span>
              <span style="background:#10b981;color:#fff;font-size:0.68rem;padding:2px 7px;border-radius:999px;font-weight:700">EN LÍNEA • PLAN SPARK GRATIS</span>
            </div>
            <div style="font-size:0.75rem;color:var(--gray-600);margin-top:3px">
              Proyecto: <code>applied-sunlight-dgtt6</code> | Base: <code>ai-studio-capfit-89d6a925-ec0e-426b-9d91-c793f721e963</code> | Tablas: <code>stores</code>, <code>products</code>, <code>orders</code>, <code>ai_logs</code>
            </div>
          </div>
        </div>
        <div style="font-size:0.76rem;font-weight:600;color:#047857;background:#ecfdf5;padding:6px 12px;border-radius:6px;border:1px solid #a7f3d0">
          ✓ Persistencia global para todas las tiendas
        </div>
      </div>

      <div class="admin-panel-card">
        <div class="admin-card-header-actions" style="margin-bottom:20px">
          <div>
            <h3 style="font-size:1.1rem;font-weight:700">Red de Tiendas y Subdominios Registrados</h3>
            <p style="font-size:0.8rem;color:var(--gray-500);margin-top:2px">
              Cada cliente tiene su tienda independiente en <code>*.capfit.store</code> con catálogo, stock y cupo mensual de imágenes IA.
            </p>
          </div>
          <button class="admin-btn-primary" onclick="AdminPanel.openCreateStoreModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            + Crear Nueva Tienda
          </button>
        </div>

        <div class="saas-stores-grid">
          ${_allStores.map(st => {
            const q = st.aiQuota || { used: 0, limit: 100, remaining: 100 };
            const pct = Math.min(100, Math.round((q.used / (q.limit || 100)) * 100));
            const isCur = st.id === _currentStoreId;
            const isExhausted = q.used >= q.limit;

            return `
              <div class="saas-store-card ${isCur ? 'current' : ''}">
                <div class="saas-store-header">
                  <div>
                    <div class="saas-store-title">${st.name} ${isCur ? '⭐ (Activa)' : ''}</div>
                    <span class="saas-store-domain">${st.subdomain}.capfit.store</span>
                  </div>
                  <span class="saas-badge-plan">${st.plan || 'Plan Standard'}</span>
                </div>

                <!-- Credenciales del dueño -->
                <div class="saas-store-creds">
                  <div><strong>Usuario dueño:</strong> <code>${st.adminUsername || 'admin_' + st.id}</code></div>
                  <div><strong>Contraseña:</strong> <code>${st.adminPassword || '••••••'}</code></div>
                  <div><strong>Catálogo:</strong> ${st.productsCount || 0} modelos · ${st.ordersCount || 0} pedidos</div>
                </div>

                <!-- Cuota mensual de IA -->
                <div style="display:flex;flex-direction:column;gap:6px">
                  <div style="display:flex;justify-content:space-between;font-size:0.78rem">
                    <span>Imágenes IA del mes:</span>
                    <strong style="color:${isExhausted ? '#dc2626' : '#059669'}">${q.used} / ${q.limit}</strong>
                  </div>
                  <div class="quota-progress-track">
                    <div class="quota-progress-bar ${isExhausted ? 'danger' : (pct >= 80 ? 'warning' : '')}" style="width:${pct}%"></div>
                  </div>
                  <div style="font-size:0.72rem;color:var(--gray-500);text-align:right">
                    ${isExhausted ? '⚠️ Cupo agotado este mes' : `${q.remaining} disponibles`}
                  </div>
                </div>

                <!-- Botones de Acción -->
                <div class="saas-store-actions">
                  <button class="admin-btn-sec-sm" onclick="AdminPanel.switchActiveStore('${st.id}'); AdminPanel.switchTab('catalogo');">
                    📦 Administrar Catálogo
                  </button>
                  <button class="admin-btn-sec-sm" onclick="AdminPanel.openEditStoreQuotaModal('${st.id}')">
                    ⚡ Cuota & Plan
                  </button>
                  <button class="admin-btn-outline" style="padding:4px 8px;font-size:0.75rem" onclick="Store.switchStore('${st.id}')">
                    🌐 Ver Tienda
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ── MODAL: CREAR NUEVA TIENDA / SUBDOMINIO ──
  function openCreateStoreModal() {
    const existing = document.getElementById('admin-create-store-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'admin-create-store-modal';
    modal.className = 'admin-modal-overlay';
    modal.innerHTML = `
      <div class="admin-modal-box" style="max-width:540px">
        <div class="admin-modal-header">
          <h3>Crear Nueva Tienda Multitenant</h3>
          <button type="button" class="admin-modal-close" onclick="document.getElementById('admin-create-store-modal').remove()">×</button>
        </div>

        <form onsubmit="event.preventDefault(); AdminPanel.submitCreateStore();">
          <p style="font-size:0.8rem;color:var(--gray-600);margin-bottom:14px">
            Se registrará la tienda con su propio subdominio en <code>capfit.store</code> y se clonará la plantilla inicial de gorras para que el dueño empiece a vender de inmediato.
          </p>

          <div class="admin-field-group" style="margin-bottom:12px">
            <label>Nombre de la Tienda *</label>
            <input type="text" id="new-store-name" placeholder="Ej: Urban Caps & Co." required>
          </div>

          <div class="admin-field-group" style="margin-bottom:12px">
            <label>Subdominio deseado (*.capfit.store) *</label>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="text" id="new-store-subdomain" placeholder="tienda3" style="flex:1" required pattern="[a-z0-9\\-]+" title="Solo letras minúsculas, números y guiones">
              <span style="font-family:monospace;font-size:0.85rem;color:var(--gray-500)">.capfit.store</span>
            </div>
          </div>

          <div class="admin-field-group" style="margin-bottom:12px">
            <label>Usuario del Dueño *</label>
            <input type="text" id="new-store-user" placeholder="Ej: admin_tienda3" required>
          </div>

          <div class="admin-field-group" style="margin-bottom:12px">
            <label>Contraseña del Dueño *</label>
            <input type="text" id="new-store-pass" placeholder="Ej: tienda3pass" required>
          </div>

          <div class="admin-form-grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
            <div class="admin-field-group">
              <label>Plan de Suscripción</label>
              <select id="new-store-plan" onchange="document.getElementById('new-store-limit').value = this.value === 'Pro' ? 250 : (this.value === 'Enterprise' ? 500 : 100)">
                <option value="Starter (100)">Starter (100 fotos/mes)</option>
                <option value="Pro">Pro (250 fotos/mes)</option>
                <option value="Enterprise">Enterprise (500 fotos/mes)</option>
              </select>
            </div>
            <div class="admin-field-group">
              <label>Límite Mensual de Fotos IA</label>
              <input type="number" id="new-store-limit" value="100" min="10" step="10" required>
            </div>
          </div>

          <div class="admin-modal-footer">
            <button type="button" class="admin-btn-outline" onclick="document.getElementById('admin-create-store-modal').remove()">Cancelar</button>
            <button type="submit" class="admin-btn-primary">Registrar y Crear Tienda</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
  }

  async function submitCreateStore() {
    const name = document.getElementById('new-store-name')?.value?.trim();
    const subdomain = document.getElementById('new-store-subdomain')?.value?.trim().toLowerCase();
    const username = document.getElementById('new-store-user')?.value?.trim();
    const password = document.getElementById('new-store-pass')?.value?.trim();
    const plan = document.getElementById('new-store-plan')?.value || 'Starter';
    const limit = parseInt(document.getElementById('new-store-limit')?.value, 10) || 100;

    if (!name || !subdomain || !username || !password) {
      alert('Por favor completá todos los campos.');
      return;
    }

    try {
      if (window.showToast) window.showToast('Creando nueva tienda en la nube...');
      const res = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subdomain,
          adminUsername: username,
          adminPassword: password,
          plan,
          aiMonthlyLimit: limit
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo crear la tienda');

      const modal = document.getElementById('admin-create-store-modal');
      if (modal) modal.remove();

      if (window.showToast) window.showToast(`¡Tienda "${name}" creada en ${subdomain}.capfit.store!`);
      await refreshData();
    } catch (e) {
      alert('Error creando la tienda: ' + e.message);
    }
  }

  // ── MODAL: EDITAR CUOTA / PLAN DE TIENDA ──
  function openEditStoreQuotaModal(storeId) {
    const targetStore = _allStores.find(s => s.id === storeId) || { id: storeId, name: _currentStoreName, subdomain: _currentSubdomain };
    const q = targetStore.aiQuota || _aiQuota || { used: 0, limit: 100 };

    const existing = document.getElementById('admin-quota-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'admin-quota-modal';
    modal.className = 'admin-modal-overlay';
    modal.innerHTML = `
      <div class="admin-modal-box" style="max-width:480px">
        <div class="admin-modal-header">
          <h3>Configurar Cuota de IA · ${targetStore.name}</h3>
          <button type="button" class="admin-modal-close" onclick="document.getElementById('admin-quota-modal').remove()">×</button>
        </div>

        <form onsubmit="event.preventDefault(); AdminPanel.submitEditStoreQuota('${storeId}');">
          <div style="background:#f8fafc;padding:12px;border-radius:8px;font-size:0.8rem;margin-bottom:14px">
            <div><strong>Subdominio:</strong> ${targetStore.subdomain}.capfit.store</div>
            <div><strong>Consumo actual del mes:</strong> ${q.used} de ${q.limit} fotos generadas</div>
          </div>

          <div class="admin-field-group" style="margin-bottom:12px">
            <label>Plan de la Tienda</label>
            <select id="edit-quota-plan">
              <option value="Starter" ${targetStore.plan === 'Starter' ? 'selected' : ''}>Starter (100 fotos)</option>
              <option value="Pro" ${targetStore.plan === 'Pro' ? 'selected' : ''}>Pro (250 fotos)</option>
              <option value="Enterprise" ${targetStore.plan === 'Enterprise' ? 'selected' : ''}>Enterprise (500 fotos)</option>
            </select>
          </div>

          <div class="admin-field-group" style="margin-bottom:16px">
            <label>Límite Máximo Mensual de Fotos con IA</label>
            <input type="number" id="edit-quota-limit" value="${q.limit || 100}" min="10" step="10" required>
            <small style="color:var(--gray-500);font-size:0.75rem">Cada prueba virtual en el probador descuenta 1 imagen.</small>
          </div>

          <div style="padding:10px 12px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;margin-bottom:16px;font-size:0.78rem;color:#92400e;display:flex;align-items:center;justify-content:space-between">
            <span>¿Querés reiniciar las fotos del mes a 0?</span>
            <button type="button" class="admin-btn-sec-sm" style="background:#ffffff" onclick="document.getElementById('edit-quota-reset-flag').value = '1'; this.textContent = '✓ Listo para reiniciar';">
              Reiniciar Mes
            </button>
          </div>
          <input type="hidden" id="edit-quota-reset-flag" value="0">

          <div class="admin-modal-footer">
            <button type="button" class="admin-btn-outline" onclick="document.getElementById('admin-quota-modal').remove()">Cancelar</button>
            <button type="submit" class="admin-btn-primary">Guardar Configuración</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
  }

  async function submitEditStoreQuota(storeId) {
    const plan = document.getElementById('edit-quota-plan')?.value || 'Starter';
    const limit = parseInt(document.getElementById('edit-quota-limit')?.value, 10) || 100;
    const resetMonth = document.getElementById('edit-quota-reset-flag')?.value === '1';

    const updates = {
      plan,
      aiMonthlyLimit: limit
    };
    if (resetMonth) {
      updates.aiGenerationsUsed = 0;
    }

    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(storeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al actualizar cuota');

      const modal = document.getElementById('admin-quota-modal');
      if (modal) modal.remove();

      if (window.showToast) window.showToast('¡Cuota mensual y plan actualizados!');
      await refreshData();
    } catch (e) {
      alert('No se pudo actualizar: ' + e.message);
    }
  }

  // ── TAB 1: CATALOG & STOCK ──
  function renderCatalogTab(container) {
    container.innerHTML = `
      <div class="admin-panel-card">
        <!-- Store Database Sync Banner -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1.15rem">🔥</span>
            <div>
              <div style="font-size:0.83rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px">
                <span>Base de Datos del Cliente: Firebase Firestore</span>
                <span style="background:#dcfce7;color:#15803d;font-size:0.68rem;padding:2px 7px;border-radius:999px;font-weight:700">PERSISTENCIA ACTIVA</span>
              </div>
              <div style="font-size:0.73rem;color:var(--gray-500);margin-top:2px">
                Ruta aislada: <code>/stores/${_currentStoreId}/products</code> · Gorras, anteojos y accesorios guardados por cliente.
              </div>
            </div>
          </div>
          <button class="admin-btn-sec-sm" onclick="AdminPanel.syncCatalogToFirestore()" title="Forzar sincronización de este catálogo en Firestore" style="display:inline-flex;align-items:center;gap:6px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Sincronizar con Firestore
          </button>
        </div>

        <div class="admin-card-header-actions">
          <div class="admin-search-filter-row">
            <div class="admin-search-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="admin-prod-search" placeholder="Buscar por nombre, marca o colección..." value="${_productSearch}" oninput="AdminPanel.filterProducts(this.value)">
            </div>
            <div class="admin-filter-select-wrap">
              <select id="admin-type-filter-select" onchange="AdminPanel.filterType(this.value)">
                <option value="todos" ${_productTypeFilter === 'todos' ? 'selected' : ''}>Todos los tipos</option>
                <option value="gorra" ${_productTypeFilter === 'gorra' ? 'selected' : ''}>🧢 Gorras</option>
                <option value="anteojos" ${_productTypeFilter === 'anteojos' ? 'selected' : ''}>🕶️ Anteojos</option>
                <option value="gorro" ${_productTypeFilter === 'gorro' ? 'selected' : ''}>🧶 Gorros / Beanies</option>
              </select>
            </div>
            <div class="admin-filter-select-wrap">
              <select id="admin-stock-filter-select" onchange="AdminPanel.filterStock(this.value)">
                <option value="todos" ${_productStockFilter === 'todos' ? 'selected' : ''}>Todos los niveles de stock</option>
                <option value="bajo" ${_productStockFilter === 'bajo' ? 'selected' : ''}>Stock crítico (≤ 5 unidades)</option>
                <option value="agotado" ${_productStockFilter === 'agotado' ? 'selected' : ''}>Agotados (0 unidades)</option>
                <option value="disponible" ${_productStockFilter === 'disponible' ? 'selected' : ''}>Con stock (> 5 unidades)</option>
              </select>
            </div>
          </div>
          <button class="admin-btn-primary" onclick="AdminPanel.openNewProductModal()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            + Nuevo Producto
          </button>
        </div>

        <div id="admin-products-table-wrap" class="admin-table-container"></div>
      </div>
    `;

    renderProductsTable();
  }

  function renderProductsTable() {
    const tableWrap = document.getElementById('admin-products-table-wrap');
    if (!tableWrap) return;

    let list = [..._products];

    // Filter text
    if (_productSearch.trim()) {
      const q = _productSearch.toLowerCase().trim();
      list = list.filter(p =>
        p.nombre.toLowerCase().includes(q) ||
        (p.marca && p.marca.toLowerCase().includes(q)) ||
        (p.coleccion && p.coleccion.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase().includes(q))
      );
    }

    // Filter type
    if (_productTypeFilter !== 'todos') {
      list = list.filter(p => {
        const t = (p.tipo || p.categoria || 'gorra').toLowerCase();
        if (_productTypeFilter === 'anteojos') {
          return t === 'anteojos' || t === 'anteojo';
        }
        return t === _productTypeFilter;
      });
    }

    // Filter stock
    if (_productStockFilter === 'bajo') {
      list = list.filter(p => (p.stock !== undefined && p.stock <= 5 && p.stock > 0));
    } else if (_productStockFilter === 'agotado') {
      list = list.filter(p => (p.stock !== undefined && p.stock === 0));
    } else if (_productStockFilter === 'disponible') {
      list = list.filter(p => (p.stock === undefined || p.stock > 5));
    }

    if (list.length === 0) {
      const isFiltered = Boolean(
        (_productSearch && _productSearch.trim() !== '') ||
        _productTypeFilter !== 'todos' ||
        _productStockFilter !== 'todos'
      );
      tableWrap.innerHTML = `
        <div class="admin-empty-state" style="padding:48px 20px;text-align:center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px;margin:0 auto 12px;color:#94a3b8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
          <h4 style="font-size:1.1rem;font-weight:700;color:#1e293b;margin-bottom:6px">${isFiltered ? 'No se encontraron productos' : 'Tu catálogo está listo y vacío'}</h4>
          <p style="font-size:0.88rem;color:#64748b;max-width:440px;margin:0 auto 18px">${isFiltered ? 'Probá cambiando los términos de búsqueda o los filtros de tipo y stock.' : 'Aún no tenés prendas registradas en tu tienda. Comenzá publicando tu primer producto.'}</p>
          ${!isFiltered ? `
            <button type="button" class="admin-btn-primary" onclick="AdminPanel.openNewProductModal()" style="display:inline-flex;align-items:center;gap:8px;margin:0 auto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Crear Mi Primer Producto
            </button>
          ` : ''}
        </div>
      `;
      return;
    }

    tableWrap.innerHTML = `
      <table class="admin-data-table">
        <thead>
          <tr>
            <th style="width:70px">Foto</th>
            <th>Producto & Colección</th>
            <th style="width:160px">Precio Actual</th>
            <th style="width:140px">Precio Anterior</th>
            <th style="width:180px">Control de Stock</th>
            <th style="width:110px">Badge</th>
            <th style="width:140px;text-align:right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(p => {
            const stockVal = p.stock !== undefined ? p.stock : 10;
            let stockBadgeClass = 'stock-ok';
            let stockLabel = `${stockVal} un.`;
            if (stockVal === 0) {
              stockBadgeClass = 'stock-out';
              stockLabel = 'Agotado';
            } else if (stockVal <= 5) {
              stockBadgeClass = 'stock-low';
              stockLabel = `Crítico (${stockVal})`;
            }

            const isAnteojos = p.tipo === 'anteojos' || p.tipo === 'anteojo';
            const isGorro = p.tipo === 'gorro';
            const typeLabel = isAnteojos ? '🕶️ Anteojos' : (isGorro ? '🧶 Gorro' : '🧢 Gorra');

            return `
              <tr id="admin-row-${p.id}">
                <td>
                  <div class="admin-thumb-box" onclick="AdminPanel.triggerPhotoUpload('${p.id}')" title="Clic para cambiar foto">
                    <img src="${p.imgPreview || (isAnteojos ? 'assets/anteojos/ant_arg.png' : 'assets/gorras/Gorra_negra_frente.webp')}" alt="${p.nombre}">
                    <span class="thumb-edit-overlay">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </span>
                  </div>
                </td>
                <td>
                  <div class="admin-product-cell-info">
                    <strong class="prod-cell-name">${p.nombre}</strong>
                    <div class="prod-cell-sub">
                      <span style="font-weight:600;color:var(--gray-800)">${typeLabel}</span> • <span>${p.marca || 'CAPFIT'}</span> • <span>${p.coleccion || 'Urbana'}</span> • <small class="text-mono">${p.id}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="admin-inline-edit-price">
                    <span class="currency-prefix">$</span>
                    <input type="number" step="100" min="0" value="${p.precio || 0}"
                      id="price-input-${p.id}"
                      onchange="AdminPanel.handleInlinePriceChange('${p.id}', this.value)"
                      class="admin-table-input price-input">
                  </div>
                </td>
                <td>
                  <div class="admin-inline-edit-price">
                    <span class="currency-prefix">$</span>
                    <input type="number" step="100" min="0" value="${p.precioAnterior || ''}" placeholder="Sin oferta"
                      id="prev-price-input-${p.id}"
                      onchange="AdminPanel.handleInlinePrevPriceChange('${p.id}', this.value)"
                      class="admin-table-input prev-price-input">
                  </div>
                </td>
                <td>
                  <div class="admin-stock-control-cell">
                    <button class="btn-stock-adj minus" onclick="AdminPanel.adjustStock('${p.id}', -1)" title="Restar 1">-</button>
                    <input type="number" min="0" value="${stockVal}"
                      id="stock-input-${p.id}"
                      onchange="AdminPanel.updateProductStock('${p.id}', this.value)"
                      class="admin-table-input stock-input">
                    <button class="btn-stock-adj plus" onclick="AdminPanel.adjustStock('${p.id}', 1)" title="Sumar 1">+</button>
                    <span class="admin-stock-pill ${stockBadgeClass}">${stockLabel}</span>
                  </div>
                </td>
                <td>
                  ${p.badge ? `<span class="badge-pill badge-${p.badge.toLowerCase().replace(/\s+/g, '-')}">${p.badge}</span>` : '<span style="color:#94a3b8;font-size:0.75rem">—</span>'}
                </td>
                <td style="text-align:right">
                  <div class="admin-row-actions">
                    <button class="admin-action-icon-btn" onclick="AdminPanel.openEditProductModal('${p.id}')" title="Editar detalles completos">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button class="admin-action-icon-btn" onclick="AdminPanel.triggerPhotoUpload('${p.id}')" title="Subir nueva foto">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </button>
                    <button class="admin-action-icon-btn danger" onclick="AdminPanel.deleteProduct('${p.id}')" title="Eliminar producto">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  // ── TAB 2: ORDERS & SHIPMENTS ──
  function renderOrdersTab(container) {
    container.innerHTML = `
      <div class="admin-panel-card">
        <div class="admin-card-header-actions">
          <div class="admin-search-filter-row">
            <div class="admin-search-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="admin-order-search" placeholder="Buscar por cliente, N° de orden o email..." value="${_orderSearch}" oninput="AdminPanel.filterOrders(this.value)">
            </div>
            <div class="admin-filter-select-wrap">
              <select id="admin-order-payment-filter" onchange="AdminPanel.filterOrderPayment(this.value)">
                <option value="todos" ${_orderPaymentFilter === 'todos' ? 'selected' : ''}>Pago: Todos</option>
                <option value="Aprobado" ${_orderPaymentFilter === 'Aprobado' ? 'selected' : ''}>Aprobados</option>
                <option value="Pendiente" ${_orderPaymentFilter === 'Pendiente' ? 'selected' : ''}>Pendientes</option>
                <option value="Rechazado" ${_orderPaymentFilter === 'Rechazado' ? 'selected' : ''}>Rechazados</option>
              </select>
            </div>
            <div class="admin-filter-select-wrap">
              <select id="admin-order-shipping-filter" onchange="AdminPanel.filterOrderShipping(this.value)">
                <option value="todos" ${_orderShippingFilter === 'todos' ? 'selected' : ''}>Despacho: Todos</option>
                <option value="Por preparar" ${_orderShippingFilter === 'Por preparar' ? 'selected' : ''}>Por preparar</option>
                <option value="En camino" ${_orderShippingFilter === 'En camino' ? 'selected' : ''}>En camino</option>
                <option value="Entregado" ${_orderShippingFilter === 'Entregado' ? 'selected' : ''}>Entregados</option>
                <option value="Cancelado" ${_orderShippingFilter === 'Cancelado' ? 'selected' : ''}>Cancelados</option>
              </select>
            </div>
          </div>
        </div>

        <div id="admin-orders-list-wrap" class="admin-orders-list-container"></div>
      </div>
    `;

    renderOrdersList();
  }

  function renderOrdersList() {
    const listWrap = document.getElementById('admin-orders-list-wrap');
    if (!listWrap) return;

    let list = [..._orders];

    // Search filter
    if (_orderSearch.trim()) {
      const q = _orderSearch.toLowerCase().trim();
      list = list.filter(o =>
        (o.id && o.id.toLowerCase().includes(q)) ||
        (o.customer?.name && o.customer.name.toLowerCase().includes(q)) ||
        (o.customer?.email && o.customer.email.toLowerCase().includes(q)) ||
        (o.customer?.city && o.customer.city.toLowerCase().includes(q))
      );
    }

    // Payment status filter
    if (_orderPaymentFilter !== 'todos') {
      list = list.filter(o => o.paymentStatus === _orderPaymentFilter);
    }

    // Shipping status filter
    if (_orderShippingFilter !== 'todos') {
      list = list.filter(o => o.shippingStatus === _orderShippingFilter);
    }

    if (list.length === 0) {
      listWrap.innerHTML = `
        <div class="admin-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          <h4>No se encontraron pedidos</h4>
          <p>Los pedidos realizados a través del checkout aparecerán automáticamente aquí.</p>
        </div>
      `;
      return;
    }

    listWrap.innerHTML = list.map(order => {
      const isPaid = order.paymentStatus === 'Aprobado';
      const isPending = order.paymentStatus === 'Pendiente';
      const paymentBadgeClass = isPaid ? 'badge-pay-approved' : (isPending ? 'badge-pay-pending' : 'badge-pay-rejected');

      const isShipped = order.shippingStatus === 'En camino';
      const isDelivered = order.shippingStatus === 'Entregado';
      const isToPrepare = order.shippingStatus === 'Por preparar';
      const shippingBadgeClass = isDelivered ? 'badge-ship-delivered' : (isShipped ? 'badge-ship-transit' : (isToPrepare ? 'badge-ship-prep' : 'badge-ship-cancel'));

      const items = order.items || [];

      return `
        <div class="admin-order-card" id="admin-order-card-${order.id}">
          <div class="admin-order-head">
            <div class="order-head-left">
              <span class="order-id-pill">${order.id}</span>
              <span class="order-date">${formatDate(order.date)}</span>
              <span class="badge-payment-status ${paymentBadgeClass}">${order.paymentStatus || 'Aprobado'}</span>
              <span class="badge-shipping-status ${shippingBadgeClass}">${order.shippingStatus || 'Por preparar'}</span>
            </div>
            <div class="order-head-right">
              <span class="order-total-amount">${formatPrecio(order.total)}</span>
            </div>
          </div>

          <div class="admin-order-body">
            <!-- Customer info -->
            <div class="admin-order-col customer-col">
              <div class="order-section-title">Datos del Comprador</div>
              <div class="customer-data">
                <strong>${order.customer?.name || 'Cliente'}</strong>
                <p>📧 ${order.customer?.email || 'Sin email'}</p>
                <p>📞 ${order.customer?.phone || 'Sin teléfono'}</p>
                <p>📍 ${order.customer?.address || 'Retiro en sucursal'}${order.customer?.city ? `, ${order.customer.city}` : ''}</p>
              </div>
            </div>

            <!-- Items list -->
            <div class="admin-order-col items-col">
              <div class="order-section-title">Productos Comprados (${items.reduce((s, i) => s + (i.quantity || 1), 0)})</div>
              <div class="order-items-grid">
                ${items.map(it => `
                  <div class="order-item-chip">
                    <img src="${it.imgPreview || 'assets/gorras/Gorra_negra_frente.webp'}" alt="${it.nombre}">
                    <div class="order-item-desc">
                      <strong>${it.nombre}</strong>
                      <span>${it.color ? `Color: ${it.color}` : ''} • Cant: ${it.quantity} • ${formatPrecio(it.precio)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
              <div class="order-method-tag">
                <span>Medio de pago: <strong>${order.paymentMethod || 'Mercado Pago'}</strong></span>
                ${order.shipping > 0 ? `<span>• Envío: ${formatPrecio(order.shipping)}</span>` : '<span class="text-green">• Envío Gratis</span>'}
              </div>
            </div>

            <!-- Quick management controls -->
            <div class="admin-order-col controls-col">
              <div class="order-section-title">Gestión de Estado</div>

              <div class="admin-order-field">
                <label>Estado del Pago</label>
                <select class="admin-select-status" onchange="AdminPanel.updateOrderStatus('${order.id}', { paymentStatus: this.value })">
                  <option value="Aprobado" ${order.paymentStatus === 'Aprobado' ? 'selected' : ''}>✅ Aprobado</option>
                  <option value="Pendiente" ${order.paymentStatus === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                  <option value="Rechazado" ${order.paymentStatus === 'Rechazado' ? 'selected' : ''}>❌ Rechazado</option>
                </select>
              </div>

              <div class="admin-order-field">
                <label>Estado del Envío</label>
                <select class="admin-select-status" onchange="AdminPanel.updateOrderStatus('${order.id}', { shippingStatus: this.value })">
                  <option value="Por preparar" ${order.shippingStatus === 'Por preparar' ? 'selected' : ''}>📦 Por preparar</option>
                  <option value="En camino" ${order.shippingStatus === 'En camino' ? 'selected' : ''}>🚚 En camino</option>
                  <option value="Entregado" ${order.shippingStatus === 'Entregado' ? 'selected' : ''}>🎉 Entregado</option>
                  <option value="Cancelado" ${order.shippingStatus === 'Cancelado' ? 'selected' : ''}>🚫 Cancelado</option>
                </select>
              </div>

              <div class="admin-order-field tracking-field">
                <label>N° Guía / Seguimiento</label>
                <div class="tracking-input-row">
                  <input type="text" placeholder="Ej: AND-9283716" value="${order.trackingCode || ''}" id="tracking-input-${order.id}">
                  <button class="btn-save-tracking" onclick="AdminPanel.saveTracking('${order.id}')" title="Guardar guía">
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── TAB 3: NEW PRODUCT FORM ──
  function renderNewProductTab(container) {
    container.innerHTML = `
      <div class="admin-panel-card" style="max-width:860px;margin:0 auto">
        <div class="admin-form-header">
          <h3>Cargar Nueva Gorra al Catálogo</h3>
          <p>Completá los datos y subí la foto. La gorra estará disponible de inmediato en la tienda y en el probador con IA.</p>
        </div>

        <form class="admin-product-form" onsubmit="event.preventDefault(); AdminPanel.submitNewProduct();">
          <div class="admin-form-grid">
            <div class="admin-field-group">
              <label for="new-prod-name">Nombre del Producto *</label>
              <input type="text" id="new-prod-name" placeholder="Ej: Urbana Trucker Negra" required>
            </div>

            <div class="admin-field-group">
              <label for="new-prod-brand">Marca</label>
              <input type="text" id="new-prod-brand" placeholder="Ej: CAPFIT" value="CAPFIT">
            </div>

            <div class="admin-field-group">
              <label for="new-prod-collec">Colección</label>
              <input type="text" id="new-prod-collec" placeholder="Ej: Urbana, Sport, Edición Limitada" value="Urbana">
            </div>

            <div class="admin-field-group">
              <label for="new-prod-type">Tipo de Accesorio</label>
              <select id="new-prod-type">
                <option value="gorra" selected>Gorra</option>
                <option value="anteojos">Anteojos</option>
                <option value="gorro">Gorro / Beanie</option>
              </select>
            </div>

            <div class="admin-field-group">
              <label for="new-prod-price">Precio de Venta ($) *</label>
              <input type="number" id="new-prod-price" placeholder="24900" min="0" step="100" required>
            </div>

            <div class="admin-field-group">
              <label for="new-prod-prev-price">Precio Anterior ($ tachado para oferta)</label>
              <input type="number" id="new-prod-prev-price" placeholder="Opcional, ej: 29900" min="0" step="100">
            </div>

            <div class="admin-field-group">
              <label for="new-prod-stock">Stock Inicial (unidades) *</label>
              <input type="number" id="new-prod-stock" placeholder="10" min="0" value="12" required>
            </div>

            <div class="admin-field-group">
              <label for="new-prod-badge">Distintivo / Badge</label>
              <select id="new-prod-badge">
                <option value="">Sin distintivo</option>
                <option value="Nuevo">Nuevo</option>
                <option value="Más vendido">Más vendido</option>
                <option value="Oferta">Oferta</option>
                <option value="Edición Limitada">Edición Limitada</option>
              </select>
            </div>
          </div>

          <!-- Image Upload Zone -->
          <div class="admin-image-upload-section">
            <label class="section-label">Foto del Producto (Vista Previa & Probador IA)</label>
            <div class="upload-dropzone" id="new-prod-dropzone" onclick="document.getElementById('new-prod-file-input').click()">
              <input type="file" id="new-prod-file-input" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="AdminPanel.handleNewProductImageSelect(this)">
              <div class="dropzone-content" id="new-prod-dropzone-content">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="upload-icon"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <strong>Hacé clic o arrastrá la foto de la gorra acá</strong>
                <p>Formatos admitidos: WebP, PNG o JPG (Fondo blanco o neutro recomendado)</p>
              </div>
              <img id="new-prod-preview-img" class="dropzone-preview-img" style="display:none" alt="Previsualización">
            </div>
            <input type="hidden" id="new-prod-img-url" value="assets/gorras/Gorra_negra_frente.webp">
          </div>

          <!-- Color Variants Manager -->
          <div class="admin-colors-builder">
            <label class="section-label">Colores Disponibles</label>
            <div class="colors-chips-list" id="new-prod-colors-list">
              <span class="color-chip" data-name="Negro" data-hex="#111111">
                <span class="chip-dot" style="background:#111111"></span>
                Negro
                <button type="button" onclick="this.parentElement.remove()">×</button>
              </span>
            </div>
            <div class="add-color-row">
              <input type="color" id="color-picker-input" value="#2563eb">
              <input type="text" id="color-name-input" placeholder="Nombre (ej: Azul Francia)">
              <button type="button" class="admin-btn-sec-sm" onclick="AdminPanel.addColorVariant()">
                + Agregar Color
              </button>
            </div>
          </div>

          <!-- Details tags -->
          <div class="admin-field-group full-width">
            <label for="new-prod-details">Detalles / Características (separados por comas)</label>
            <input type="text" id="new-prod-details" value="Algodón premium, Ajuste regulable, Unisex, Logo bordado">
          </div>

          <div class="admin-form-actions">
            <button type="button" class="admin-btn-outline" onclick="AdminPanel.switchTab('catalogo')">
              Cancelar
            </button>
            <button type="submit" class="admin-btn-primary" id="btn-save-new-product">
              Guardar y Publicar en Tienda
            </button>
          </div>
        </form>
      </div>
    `;

    setupDropzoneListeners('new-prod-dropzone', 'new-prod-file-input', (url) => {
      document.getElementById('new-prod-img-url').value = url;
      const previewImg = document.getElementById('new-prod-preview-img');
      const content = document.getElementById('new-prod-dropzone-content');
      if (previewImg && content) {
        previewImg.src = url;
        previewImg.style.display = 'block';
        content.style.display = 'none';
      }
    });
  }

  // ── Product Edit Modal ──
  function openEditProductModal(id) {
    const p = _products.find(item => item.id === id);
    if (!p) return;
    _editingProduct = p;

    const existing = document.getElementById('admin-edit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'admin-edit-modal';
    modal.className = 'admin-modal-backdrop';
    modal.innerHTML = `
      <div class="admin-modal-card">
        <div class="admin-modal-header">
          <h3>Editar Producto: ${p.nombre}</h3>
          <button class="modal-close-btn" onclick="document.getElementById('admin-edit-modal').remove()">×</button>
        </div>

        <form class="admin-modal-body" onsubmit="event.preventDefault(); AdminPanel.submitEditProduct('${p.id}');">
          <div class="admin-form-grid">
            <div class="admin-field-group">
              <label>Nombre *</label>
              <input type="text" id="edit-prod-name" value="${p.nombre}" required>
            </div>
            <div class="admin-field-group">
              <label>Marca</label>
              <input type="text" id="edit-prod-brand" value="${p.marca || 'CAPFIT'}">
            </div>
            <div class="admin-field-group">
              <label>Colección</label>
              <input type="text" id="edit-prod-collec" value="${p.coleccion || 'Urbana'}">
            </div>
            <div class="admin-field-group">
              <label>Tipo</label>
              <select id="edit-prod-type">
                <option value="gorra" ${p.tipo === 'gorra' ? 'selected' : ''}>Gorra</option>
                <option value="anteojos" ${p.tipo === 'anteojos' ? 'selected' : ''}>Anteojos</option>
                <option value="gorro" ${p.tipo === 'gorro' ? 'selected' : ''}>Gorro</option>
              </select>
            </div>
            <div class="admin-field-group">
              <label>Precio Actual ($) *</label>
              <input type="number" id="edit-prod-price" value="${p.precio}" min="0" step="100" required>
            </div>
            <div class="admin-field-group">
              <label>Precio Anterior ($)</label>
              <input type="number" id="edit-prod-prev-price" value="${p.precioAnterior || ''}" placeholder="Sin oferta">
            </div>
            <div class="admin-field-group">
              <label>Stock (unidades) *</label>
              <input type="number" id="edit-prod-stock" value="${p.stock !== undefined ? p.stock : 10}" min="0" required>
            </div>
            <div class="admin-field-group">
              <label>Distintivo / Badge</label>
              <select id="edit-prod-badge">
                <option value="" ${!p.badge ? 'selected' : ''}>Sin distintivo</option>
                <option value="Nuevo" ${p.badge === 'Nuevo' ? 'selected' : ''}>Nuevo</option>
                <option value="Más vendido" ${p.badge === 'Más vendido' ? 'selected' : ''}>Más vendido</option>
                <option value="Oferta" ${p.badge === 'Oferta' ? 'selected' : ''}>Oferta</option>
                <option value="Edición Limitada" ${p.badge === 'Edición Limitada' ? 'selected' : ''}>Edición Limitada</option>
              </select>
            </div>
          </div>

          <div class="admin-field-group full-width" style="margin-top:14px">
            <label>Imagen Preview (Ruta o URL)</label>
            <div style="display:flex;gap:10px;align-items:center">
              <input type="text" id="edit-prod-img" value="${p.imgPreview || ''}" style="flex:1">
              <button type="button" class="admin-btn-sec-sm" onclick="AdminPanel.triggerModalPhotoUpload()">
                Subir Archivo
              </button>
            </div>
            <input type="file" id="modal-file-upload-input" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="AdminPanel.handleModalImageSelect(this)">
          </div>

          <div class="admin-field-group full-width" style="margin-top:14px">
            <label>Detalles / Atributos (separados por comas)</label>
            <input type="text" id="edit-prod-details" value="${(p.detalles || []).join(', ')}">
          </div>

          <div class="admin-modal-footer">
            <button type="button" class="admin-btn-outline" onclick="document.getElementById('admin-edit-modal').remove()">Cancelar</button>
            <button type="submit" class="admin-btn-primary">Guardar Cambios</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
  }

  async function submitEditProduct(id) {
    const name = document.getElementById('edit-prod-name')?.value?.trim();
    const brand = document.getElementById('edit-prod-brand')?.value?.trim();
    const collec = document.getElementById('edit-prod-collec')?.value?.trim();
    const type = document.getElementById('edit-prod-type')?.value;
    const price = parseFloat(document.getElementById('edit-prod-price')?.value) || 0;
    const prevPriceVal = document.getElementById('edit-prod-prev-price')?.value;
    const prevPrice = prevPriceVal ? parseFloat(prevPriceVal) : null;
    const stock = parseInt(document.getElementById('edit-prod-stock')?.value, 10) || 0;
    const badge = document.getElementById('edit-prod-badge')?.value || null;
    const imgPreview = document.getElementById('edit-prod-img')?.value?.trim();
    const detailsRaw = document.getElementById('edit-prod-details')?.value || '';
    const detalles = detailsRaw.split(',').map(s => s.trim()).filter(Boolean);

    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(id)}${getStoreQuery()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: name,
          marca: brand,
          coleccion: collec,
          tipo: type,
          precio: price,
          precioAnterior: prevPrice,
          stock: stock,
          badge: badge,
          imgPreview: imgPreview,
          imgFrontal: imgPreview,
          detalles: detalles
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar cambios');

      const modal = document.getElementById('admin-edit-modal');
      if (modal) modal.remove();

      if (window.showToast) window.showToast(`Producto "${name}" actualizado con éxito`);
      await refreshData();
      if (window.Catalogo) window.Catalogo.reload();
    } catch (e) {
      alert('Error guardando cambios: ' + e.message);
    }
  }

  // ── Photo Upload Triggers ──
  function triggerPhotoUpload(productId) {
    let input = document.getElementById('hidden-admin-photo-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'hidden-admin-photo-input';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.style.display = 'none';
      document.body.appendChild(input);
    }

    input.onchange = async () => {
      if (!input.files || !input.files[0]) return;
      const file = input.files[0];
      if (window.showToast) window.showToast('Subiendo foto del producto...');
      try {
        const uploadedUrl = await uploadImageFile(file);
        const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}${getStoreQuery()}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imgPreview: uploadedUrl,
            imgFrontal: uploadedUrl
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error al asociar imagen');

        const p = _products.find(item => item.id === productId);
        if (p) {
          p.imgPreview = uploadedUrl;
          p.imgFrontal = uploadedUrl;
        }

        if (window.showToast) window.showToast('¡Foto actualizada correctamente!');
        if (window.Catalogo) window.Catalogo.reload();
        renderProductsTable();
      } catch (e) {
        if (!e.message.includes('cancelado')) {
          alert('Error al subir la imagen: ' + e.message);
        }
      } finally {
        input.value = '';
      }
    };

    input.click();
  }

  function triggerModalPhotoUpload() {
    const input = document.getElementById('modal-file-upload-input');
    if (input) input.click();
  }

  async function handleModalImageSelect(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    try {
      const url = await uploadImageFile(file);
      const targetInput = document.getElementById('edit-prod-img');
      if (targetInput) targetInput.value = url;
      if (window.showToast) window.showToast('Imagen recortada y subida en .webp');
    } catch (e) {
      if (!e.message.includes('cancelado')) {
        alert('Error subiendo imagen: ' + e.message);
      }
    } finally {
      input.value = '';
    }
  }

  async function handleNewProductImageSelect(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    try {
      const url = await uploadImageFile(file);
      document.getElementById('new-prod-img-url').value = url;
      const previewImg = document.getElementById('new-prod-preview-img');
      const content = document.getElementById('new-prod-dropzone-content');
      if (previewImg && content) {
        previewImg.src = url;
        previewImg.style.display = 'block';
        content.style.display = 'none';
      }
      if (window.showToast) window.showToast('Imagen cuadrada .webp lista para publicar');
    } catch (e) {
      if (!e.message.includes('cancelado')) {
        alert('Error subiendo imagen: ' + e.message);
      }
    } finally {
      input.value = '';
    }
  }

  function setupDropzoneListeners(dropzoneId, inputId, onUploaded) {
    const dropzone = document.getElementById(dropzoneId);
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', async (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        try {
          const url = await uploadImageFile(files[0]);
          onUploaded(url);
          if (window.showToast) window.showToast('Foto cuadrada .webp cargada con éxito');
        } catch (err) {
          if (!err.message.includes('cancelado')) {
            alert('Error al subir: ' + err.message);
          }
        }
      }
    });
  }

  function addColorVariant() {
    const picker = document.getElementById('color-picker-input');
    const nameInput = document.getElementById('color-name-input');
    const list = document.getElementById('new-prod-colors-list');

    const hex = picker.value;
    const name = (nameInput.value || '').trim() || 'Color';

    const chip = document.createElement('span');
    chip.className = 'color-chip';
    chip.setAttribute('data-name', name);
    chip.setAttribute('data-hex', hex);
    chip.innerHTML = `
      <span class="chip-dot" style="background:${hex}"></span>
      ${name}
      <button type="button" onclick="this.parentElement.remove()">×</button>
    `;

    list.appendChild(chip);
    nameInput.value = '';
  }

  async function submitNewProduct() {
    const name = document.getElementById('new-prod-name')?.value?.trim();
    const brand = document.getElementById('new-prod-brand')?.value?.trim() || 'CAPFIT';
    const collec = document.getElementById('new-prod-collec')?.value?.trim() || 'Urbana';
    const type = document.getElementById('new-prod-type')?.value || 'gorra';
    const price = parseFloat(document.getElementById('new-prod-price')?.value) || 0;
    const prevPriceVal = document.getElementById('new-prod-prev-price')?.value;
    const prevPrice = prevPriceVal ? parseFloat(prevPriceVal) : null;
    const stock = parseInt(document.getElementById('new-prod-stock')?.value, 10) || 10;
    const badge = document.getElementById('new-prod-badge')?.value || null;
    const imgUrl = document.getElementById('new-prod-img-url')?.value || 'assets/gorras/Gorra_negra_frente.webp';
    const detailsRaw = document.getElementById('new-prod-details')?.value || '';
    const detalles = detailsRaw.split(',').map(s => s.trim()).filter(Boolean);

    // Collect colors
    const colorChips = document.querySelectorAll('#new-prod-colors-list .color-chip');
    const colores = Array.from(colorChips).map(c => ({
      name: c.getAttribute('data-name') || 'Color',
      hex: c.getAttribute('data-hex') || '#111111'
    }));

    if (!name || price <= 0) {
      alert('Por favor completá el nombre y un precio válido.');
      return;
    }

    const isAnteojos = type === 'anteojos' || type === 'anteojo';
    let finalImg = imgUrl;
    if ((!finalImg || finalImg.includes('Gorra_negra')) && isAnteojos) {
      finalImg = 'assets/anteojos/ant_arg.png';
    }
    const defaultDetails = isAnteojos
      ? ['Protección UV400', 'Marco resistente y liviano', 'Cristales polarizados', 'Incluye estuche']
      : ['Algodón premium', 'Ajuste regulable', 'Unisex'];

    const payload = {
      nombre: name,
      marca: brand,
      coleccion: collec,
      tipo: type,
      categoria: type,
      precio: price,
      precioAnterior: prevPrice,
      stock: stock,
      badge: badge,
      imgPreview: finalImg,
      imgFrontal: finalImg,
      colores: colores.length > 0 ? colores : [{ name: 'Negro', hex: '#111111' }],
      detalles: detalles.length > 0 ? detalles : defaultDetails
    };

    try {
      const res = await fetch(`/api/admin/products${getStoreQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar producto');

      if (window.showToast) window.showToast(`¡"${name}" guardado en la base de datos de la tienda!`);
      await refreshData();
      if (window.Catalogo) window.Catalogo.reload();
      switchTab('catalogo');
    } catch (e) {
      alert('No se pudo guardar el producto: ' + e.message);
    }
  }

  // ── Helper Handlers ──
  function adjustStock(id, delta) {
    const input = document.getElementById(`stock-input-${id}`);
    if (!input) return;
    const current = parseInt(input.value, 10) || 0;
    const next = Math.max(0, current + delta);
    input.value = next;
    updateProductStock(id, next);
  }

  function handleInlinePriceChange(id, val) {
    updateProductPrice(id, val);
  }

  function handleInlinePrevPriceChange(id, val) {
    const currentProd = _products.find(p => p.id === id);
    if (!currentProd) return;
    updateProductPrice(id, currentProd.precio, val || null);
  }

  function saveTracking(orderId) {
    const input = document.getElementById(`tracking-input-${orderId}`);
    if (!input) return;
    const tracking = input.value.trim();
    updateOrderStatus(orderId, { trackingCode: tracking });
  }

  function switchTab(tab) {
    _activeTab = tab;
    renderDashboard();
  }

  function filterProducts(searchStr) {
    _productSearch = searchStr;
    renderProductsTable();
  }

  function filterStock(stockType) {
    _productStockFilter = stockType;
    renderProductsTable();
  }

  function filterType(type) {
    _productTypeFilter = type;
    renderProductsTable();
  }

  async function syncCatalogToFirestore() {
    try {
      if (window.showToast) window.showToast('Sincronizando con base de datos en la nube...');
      const res = await fetch(`/api/admin/products/sync${getStoreQuery()}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error en sincronización');
      if (window.showToast) window.showToast(`¡${data.count || _products.length} productos guardados en Firestore para ${_currentStoreName}!`);
      await refreshData();
    } catch (e) {
      alert('Error sincronizando con Firestore: ' + e.message);
    }
  }

  function filterOrders(searchStr) {
    _orderSearch = searchStr;
    renderOrdersList();
  }

  function filterOrderPayment(val) {
    _orderPaymentFilter = val;
    renderOrdersList();
  }

  function filterOrderShipping(val) {
    _orderShippingFilter = val;
    renderOrdersList();
  }

  function togglePasswordVisibility(targetId = 'admin-pass-input') {
    const input = document.getElementById(targetId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  async function handleForgotPassword() {
    const emailEl = document.getElementById('admin-email-input');
    let email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
      email = prompt('Ingresá tu correo electrónico para restablecer tu contraseña:') || '';
      email = email.trim();
    }
    if (!email) return;

    try {
      if (window.CapfitAuth && CapfitAuth.resetPassword) {
        await CapfitAuth.resetPassword(email);
        alert(`Te hemos enviado un correo a ${email} con el enlace de recuperación de contraseña.`);
      } else {
        alert(`Instrucciones enviadas a ${email}. Revisá tu casilla de correo o spam.`);
      }
    } catch (e) {
      alert('No se pudo enviar el correo de recuperación: ' + e.message);
    }
  }

  function showTermsModal() {
    if (window.showModal) {
      window.showModal({
        title: 'Términos de Servicio — CAPFIT',
        content: '<div style="line-height:1.6;font-size:0.9rem;color:#334155"><p>Al utilizar la plataforma CAPFIT para gestionar tu tienda, catálogo y probador virtual asistido por IA, aceptás las condiciones de disponibilidad del servicio, protección de marcas y gestión segura de ventas.</p></div>',
        buttonText: 'Entendido'
      });
    } else {
      alert('Términos de Servicio CAPFIT: Plataforma SaaS de comercio y probadores virtuales de accesorios con IA.');
    }
  }

  function showPrivacyModal() {
    if (window.showModal) {
      window.showModal({
        title: 'Política de Privacidad — CAPFIT',
        content: '<div style="line-height:1.6;font-size:0.9rem;color:#334155"><p>En CAPFIT priorizamos la seguridad de tus datos y los de tus clientes. Las fotografías procesadas en el probador virtual se utilizan exclusivamente para la simulación visual. Todos los accesos se encuentran debidamente cifrados.</p></div>',
        buttonText: 'Entendido'
      });
    } else {
      alert('Política de Privacidad CAPFIT: Tus datos y las fotos del probador virtual están 100% protegidos y cifrados.');
    }
  }

  function submitLogin() {
    const passInput = document.getElementById('admin-pass-input');
    const userInput = document.getElementById('admin-user-input');
    const pass = passInput ? passInput.value.trim() : '';
    const user = userInput ? userInput.value.trim() : '';
    login(user, pass);
  }

  function openNewProductModal() {
    switchTab('nuevo');
  }

  // ── Main Render Entry Point ──
  async function render() {
    if (!isLoggedIn()) {
      renderLoginView();
      return;
    }

    const container = document.getElementById('admin-content-area');
    if (container && (!container.innerHTML || container.innerHTML.includes('auth-card') || container.innerHTML.includes('admin-login-card'))) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:#64748b;min-height:300px">
          <div class="spinner" style="width:34px;height:34px;border:3px solid #e2e8f0;border-top-color:#0f172a;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:14px"></div>
          <span style="font-size:0.92rem;font-weight:500">Cargando panel de administración...</span>
        </div>
      `;
    }

    await Promise.all([loadProducts(), loadOrders(), loadStoreQuota()]);
    renderDashboard();
  }

  return {
    init: render,
    isLoggedIn,
    login,
    logout,
    submitLogin,
    loginWithGoogle,
    loginWithFirebaseEmail,
    submitFirebaseEmailLogin,
    registerNewStoreOwner,
    submitRegisterStoreOwner,
    setPortalTab,
    syncSubdomainSuggestion,
    updateSubdomainPreview,
    setLoginMode,
    fillDemoLogin,
    switchActiveStore,
    openCreateStoreModal,
    submitCreateStore,
    openEditStoreQuotaModal,
    submitEditStoreQuota,
    togglePasswordVisibility,
    handleForgotPassword,
    showTermsModal,
    showPrivacyModal,
    switchTab,
    refreshData,
    loadProducts,
    loadOrders,
    loadStoreQuota,
    filterProducts,
    filterStock,
    filterType,
    syncCatalogToFirestore,
    filterOrders,
    filterOrderPayment,
    filterOrderShipping,
    adjustStock,
    updateProductStock,
    updateProductPrice,
    handleInlinePriceChange,
    handleInlinePrevPriceChange,
    deleteProduct,
    triggerPhotoUpload,
    triggerModalPhotoUpload,
    handleModalImageSelect,
    handleNewProductImageSelect,
    openEditProductModal,
    submitEditProduct,
    openNewProductModal,
    submitNewProduct,
    addColorVariant,
    saveTracking,
    updateOrderStatus,
    openSectionsEditor,
    switchSectionSubtab,
    saveCurrentSectionForm,
    resetCurrentSectionForm,
    addFaqItemRow,
    removeFaqItemRow
  };
})();

window.AdminPanel = AdminPanel;