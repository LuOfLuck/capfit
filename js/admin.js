// ── CAPFIT Backoffice & Store Admin Manager ──

const AdminPanel = (() => {
  const SESSION_KEY = 'capfit_admin_auth_token';
  const ROLE_KEY = 'capfit_admin_role';
  const STORE_ID_KEY = 'capfit_admin_store_id';
  const STORE_NAME_KEY = 'capfit_admin_store_name';
  const SUBDOMAIN_KEY = 'capfit_admin_subdomain';

  let _products = [];
  let _orders = [];
  let _activeTab = 'catalogo'; // 'catalogo' | 'pedidos' | 'nuevo' | 'tiendas'
  let _productSearch = '';
  let _productStockFilter = 'todos'; // 'todos' | 'bajo' | 'agotado' | 'disponible'
  let _orderSearch = '';
  let _orderPaymentFilter = 'todos';
  let _orderShippingFilter = 'todos';
  let _editingProduct = null;

  // Multi-tenant & SaaS State
  let _adminRole = sessionStorage.getItem(ROLE_KEY) || 'store_owner';
  let _currentStoreId = sessionStorage.getItem(STORE_ID_KEY) || (window.Store && Store.getCurrentStoreId ? Store.getCurrentStoreId() : 'principal');
  let _currentStoreName = sessionStorage.getItem(STORE_NAME_KEY) || 'CAPFIT Store';
  let _currentSubdomain = sessionStorage.getItem(SUBDOMAIN_KEY) || 'tienda1';
  let _aiQuota = null;
  let _allStores = [];
  let _loginMode = 'store'; // 'store' | 'superadmin'

  function isLoggedIn() {
    return !!sessionStorage.getItem(SESSION_KEY);
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

  // ── Authentication ──
  async function login(username, password, storeId = null) {
    const errorEl = document.getElementById('admin-login-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
      const payload = {
        username: (username || '').trim(),
        password: (password || '').trim(),
        storeId: storeId || _currentStoreId
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

      sessionStorage.setItem(SESSION_KEY, data.token || 'valid');
      sessionStorage.setItem(ROLE_KEY, _adminRole);
      sessionStorage.setItem(STORE_ID_KEY, _currentStoreId);
      sessionStorage.setItem(STORE_NAME_KEY, _currentStoreName);
      sessionStorage.setItem(SUBDOMAIN_KEY, _currentSubdomain);

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

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(STORE_ID_KEY);
    sessionStorage.removeItem(STORE_NAME_KEY);
    sessionStorage.removeItem(SUBDOMAIN_KEY);
    _adminRole = 'store_owner';
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

  // ── Upload Image to Server ──
  async function uploadImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result;
          const res = await fetch('/api/admin/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              base64: base64
            })
          });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Fallo al subir imagen');
          resolve(data.url);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsDataURL(file);
    });
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

  function renderLoginView() {
    const container = document.getElementById('admin-content-area');
    if (!container) return;

    const isStoreMode = _loginMode === 'store';

    container.innerHTML = `
      <div class="admin-login-card" style="max-width:500px">
        <div class="admin-login-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        
        <!-- Toggle Store Owner vs SuperAdmin -->
        <div style="display:flex;gap:8px;background:#f1f5f9;padding:4px;border-radius:10px;margin-bottom:18px;width:100%">
          <button type="button" class="admin-tab-btn ${isStoreMode ? 'active' : ''}" style="flex:1;justify-content:center;padding:8px 12px;font-size:0.8rem;border:none" onclick="AdminPanel.setLoginMode('store')">
            🏪 Dueño de Tienda
          </button>
          <button type="button" class="admin-tab-btn ${!isStoreMode ? 'active' : ''}" style="flex:1;justify-content:center;padding:8px 12px;font-size:0.8rem;border:none" onclick="AdminPanel.setLoginMode('superadmin')">
            👑 SuperAdmin SaaS
          </button>
        </div>

        <span class="admin-login-badge">${isStoreMode ? 'Acceso a tu Tienda y Catálogo' : 'Control Central Multitienda'}</span>
        <h2 class="admin-login-title">${isStoreMode ? 'Ingreso para Dueño de Tienda' : 'Consola Maestra CAPFIT'}</h2>
        <p class="admin-login-desc">${isStoreMode ? 'Accedé con tu usuario y contraseña de tienda para gestionar tus gorras, stock y controlar tu cupo mensual de IA.' : 'Acceso administrativo central para supervisar todas las tiendas creadas en *.capfit.shop y asignar planes.'}</p>

        <form class="admin-login-form" onsubmit="event.preventDefault(); AdminPanel.submitLogin();">
          ${isStoreMode ? `
            <div class="admin-field-group">
              <label for="admin-user-input">Usuario de Tienda</label>
              <input type="text" id="admin-user-input" placeholder="Ej: admin_tienda1" required autocomplete="username">
            </div>
          ` : ''}

          <div class="admin-field-group">
            <label for="admin-pass-input">${isStoreMode ? 'Contraseña de Tienda' : 'Clave Maestra de SuperAdmin'}</label>
            <div class="admin-input-wrap">
              <input type="password" id="admin-pass-input" placeholder="••••••••" required autocomplete="current-password">
              <button type="button" class="admin-toggle-pass" onclick="AdminPanel.togglePasswordVisibility()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="admin-pass-eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </div>

          <div id="admin-login-error" class="admin-error-box" style="display:none"></div>

          <button type="submit" class="admin-btn-primary full-width" id="btn-admin-submit-login">
            Ingresar al Panel
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </form>

        <!-- 1-Click Fast Login Demos -->
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--gray-200);width:100%">
          <div style="font-size:0.75rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;margin-bottom:8px;text-align:center">
            🚀 Accesos Rápidos de Demostración:
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button type="button" class="admin-btn-sec-sm" style="width:100%;text-align:left;display:flex;justify-content:space-between;padding:8px 12px" onclick="AdminPanel.setLoginMode('store'); setTimeout(() => AdminPanel.fillDemoLogin('admin_tienda1', 'tienda1pass'), 50);">
              <span>🏪 <strong>Tienda 1</strong> (StreetWear Caps)</span>
              <small style="color:#059669">Cupo activo (26/100)</small>
            </button>
            <button type="button" class="admin-btn-sec-sm" style="width:100%;text-align:left;display:flex;justify-content:space-between;padding:8px 12px" onclick="AdminPanel.setLoginMode('store'); setTimeout(() => AdminPanel.fillDemoLogin('admin_tienda2', 'tienda2pass'), 50);">
              <span>⚠️ <strong>Tienda 2</strong> (Urban Vintage)</span>
              <small style="color:#dc2626">Cupo agotado (100/100)</small>
            </button>
            <button type="button" class="admin-btn-sec-sm" style="width:100%;text-align:left;display:flex;justify-content:space-between;padding:8px 12px" onclick="AdminPanel.setLoginMode('superadmin'); setTimeout(() => AdminPanel.fillDemoLogin('', 'capfit2026'), 50);">
              <span>👑 <strong>SuperAdmin CAPFIT</strong></span>
              <small style="color:#2563eb">Gestionar red SaaS</small>
            </button>
          </div>
        </div>

        <div class="admin-login-back">
          <button onclick="navigateToView('inicio')" class="admin-btn-link">
            ← Volver a la tienda
          </button>
        </div>
      </div>
    `;
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
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div class="admin-badge-status">
              <span class="pulse-dot"></span>
              ${isSuper ? '👑 SuperAdmin SaaS' : '🏪 Dueño de Tienda'}
            </div>
            <span class="saas-store-domain">${_currentSubdomain}.capfit.shop</span>
            <span style="display:inline-flex;align-items:center;gap:4px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;font-size:0.72rem;padding:3px 8px;border-radius:999px;font-weight:600" title="Base de Datos Cloud Firebase Firestore Activa">
              🔥 Firebase Firestore
            </span>
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
    } else if (_activeTab === 'tiendas') {
      renderStoresTab(tabArea);
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
              Cada cliente tiene su tienda independiente en <code>*.capfit.shop</code> con catálogo, stock y cupo mensual de imágenes IA.
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
                    <span class="saas-store-domain">${st.subdomain}.capfit.shop</span>
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
            Se registrará la tienda con su propio subdominio en <code>capfit.shop</code> y se clonará la plantilla inicial de gorras para que el dueño empiece a vender de inmediato.
          </p>

          <div class="admin-field-group" style="margin-bottom:12px">
            <label>Nombre de la Tienda *</label>
            <input type="text" id="new-store-name" placeholder="Ej: Urban Caps & Co." required>
          </div>

          <div class="admin-field-group" style="margin-bottom:12px">
            <label>Subdominio deseado (*.capfit.shop) *</label>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="text" id="new-store-subdomain" placeholder="tienda3" style="flex:1" required pattern="[a-z0-9\\-]+" title="Solo letras minúsculas, números y guiones">
              <span style="font-family:monospace;font-size:0.85rem;color:var(--gray-500)">.capfit.shop</span>
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

      if (window.showToast) window.showToast(`¡Tienda "${name}" creada en ${subdomain}.capfit.shop!`);
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
            <div><strong>Subdominio:</strong> ${targetStore.subdomain}.capfit.shop</div>
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
        <div class="admin-card-header-actions">
          <div class="admin-search-filter-row">
            <div class="admin-search-input-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="admin-prod-search" placeholder="Buscar por nombre, marca o colección..." value="${_productSearch}" oninput="AdminPanel.filterProducts(this.value)">
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
            Agregar Gorra
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

    // Filter stock
    if (_productStockFilter === 'bajo') {
      list = list.filter(p => (p.stock !== undefined && p.stock <= 5 && p.stock > 0));
    } else if (_productStockFilter === 'agotado') {
      list = list.filter(p => (p.stock !== undefined && p.stock === 0));
    } else if (_productStockFilter === 'disponible') {
      list = list.filter(p => (p.stock === undefined || p.stock > 5));
    }

    if (list.length === 0) {
      tableWrap.innerHTML = `
        <div class="admin-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
          <h4>No se encontraron gorras</h4>
          <p>Probá cambiando los términos de búsqueda o filtros.</p>
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

            return `
              <tr id="admin-row-${p.id}">
                <td>
                  <div class="admin-thumb-box" onclick="AdminPanel.triggerPhotoUpload('${p.id}')" title="Clic para cambiar foto">
                    <img src="${p.imgPreview || 'assets/gorras/Gorra_negra_frente.webp'}" alt="${p.nombre}">
                    <span class="thumb-edit-overlay">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    </span>
                  </div>
                </td>
                <td>
                  <div class="admin-product-cell-info">
                    <strong class="prod-cell-name">${p.nombre}</strong>
                    <div class="prod-cell-sub">
                      <span>${p.marca || 'CAPFIT'}</span> • <span>${p.coleccion || 'Urbana'}</span> • <small class="text-mono">${p.id}</small>
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
        alert('Error al subir la imagen: ' + e.message);
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
      if (window.showToast) window.showToast('Subiendo imagen...');
      const url = await uploadImageFile(file);
      const targetInput = document.getElementById('edit-prod-img');
      if (targetInput) targetInput.value = url;
      if (window.showToast) window.showToast('Imagen subida con éxito');
    } catch (e) {
      alert('Error subiendo imagen: ' + e.message);
    }
  }

  async function handleNewProductImageSelect(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    try {
      if (window.showToast) window.showToast('Subiendo imagen...');
      const url = await uploadImageFile(file);
      document.getElementById('new-prod-img-url').value = url;
      const previewImg = document.getElementById('new-prod-preview-img');
      const content = document.getElementById('new-prod-dropzone-content');
      if (previewImg && content) {
        previewImg.src = url;
        previewImg.style.display = 'block';
        content.style.display = 'none';
      }
      if (window.showToast) window.showToast('Imagen lista para publicar');
    } catch (e) {
      alert('Error subiendo imagen: ' + e.message);
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
          if (window.showToast) window.showToast('Subiendo archivo arrastrado...');
          const url = await uploadImageFile(files[0]);
          onUploaded(url);
          if (window.showToast) window.showToast('Foto cargada');
        } catch (err) {
          alert('Error al subir: ' + err.message);
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

    const payload = {
      nombre: name,
      marca: brand,
      coleccion: collec,
      tipo: type,
      precio: price,
      precioAnterior: prevPrice,
      stock: stock,
      badge: badge,
      imgPreview: imgUrl,
      imgFrontal: imgUrl,
      colores: colores.length > 0 ? colores : [{ name: 'Negro', hex: '#111111' }],
      detalles: detalles.length > 0 ? detalles : ['Algodón premium', 'Ajuste regulable', 'Unisex'],
      model3D: 'assets/hat.glb'
    };

    try {
      const res = await fetch(`/api/admin/products${getStoreQuery()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al guardar producto');

      if (window.showToast) window.showToast(`¡"${name}" agregado exitosamente al catálogo!`);
      await refreshData();
      if (window.Catalogo) window.Catalogo.reload();
      switchTab('catalogo');
    } catch (e) {
      alert('No se pudo guardar la gorra: ' + e.message);
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

  function togglePasswordVisibility() {
    const input = document.getElementById('admin-pass-input');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
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

    await Promise.all([loadProducts(), loadOrders(), loadStoreQuota()]);
    renderDashboard();
  }

  return {
    init: render,
    isLoggedIn,
    login,
    logout,
    submitLogin,
    setLoginMode,
    fillDemoLogin,
    switchActiveStore,
    openCreateStoreModal,
    submitCreateStore,
    openEditStoreQuotaModal,
    submitEditStoreQuota,
    togglePasswordVisibility,
    switchTab,
    refreshData,
    loadProducts,
    loadOrders,
    loadStoreQuota,
    filterProducts,
    filterStock,
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
    updateOrderStatus
  };
})();

window.AdminPanel = AdminPanel;
