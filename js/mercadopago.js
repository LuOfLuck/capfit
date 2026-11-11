// ── CAPFIT Multi-Tenant Mercado Pago Checkout Pro Module ──
//
// Flujo Fase 1:
// 1. Verifica en el servidor (`/api/store/current`) si la tienda correspondiente al subdominio
//    tiene su propia cuenta de Mercado Pago conectada (`mpConnected: true`).
// 2. Si la tienda NO conectó Mercado Pago, muestra un aviso claro y deshabilita el inicio del pago.
// 3. Si la tienda tiene Mercado Pago activo, solicita los datos de envío y contacto del comprador,
//    envía el pedido al backend (`POST /api/payments/mp/create-preference`) donde se validan
//    productos, stock y precios reales desde Firestore y se genera la preferencia de Checkout Pro
//    usando exclusivamente las credenciales del vendedor (sin `application_fee` ni comisiones de CapFit).
// 4. Redirige al comprador a Mercado Pago Checkout Pro y procesa el retorno (`?mp_return=success|pending|failure`).

const MercadoPagoGateway = (() => {
  let _activeStore = null;
  let _lastCreatedOrder = null;

  function formatPrice(num) {
    return '$' + Math.round(Number(num) || 0).toLocaleString('es-AR');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getActiveStoreId() {
    if (window.Store && typeof window.Store.getCurrentStoreId === 'function') {
      return window.Store.getCurrentStoreId() || 'principal';
    }
    return 'principal';
  }

  function getOrderData() {
    const items = window.Cart ? window.Cart.getItems() : [];
    const subtotal = window.Cart ? window.Cart.getSubtotal() : 0;
    const isFreeShipping = window.Cart ? window.Cart.getFreeShippingRemaining() === 0 : true;
    const shipping = isFreeShipping ? 0 : 3500;
    const total = subtotal + shipping;
    return { items, subtotal, shipping, total, isFreeShipping };
  }

  async function fetchFreshStoreStatus() {
    const storeId = getActiveStoreId();
    try {
      const res = await fetch(`/api/store/current?store=${encodeURIComponent(storeId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.store) {
          _activeStore = data.store;
          _activeStore.subscriptionAccess = data.subscriptionAccess || null;
          return _activeStore;
        }
      }
    } catch (_) {}
    if (window.Store && typeof window.Store.getCurrentStore === 'function') {
      _activeStore = window.Store.getCurrentStore();
    }
    return _activeStore || { id: storeId, name: 'Tienda CAPFIT', subdomain: storeId, mpConnected: false };
  }

  function renderModalHTML() {
    let modal = document.getElementById('mp-checkout-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'mp-checkout-modal';
    modal.className = 'mp-modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="mp-modal-card" style="max-width:540px">
        <!-- Top Navigation Header -->
        <div class="mp-header-top">
          <div class="mp-top-security">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Checkout seguro con <strong>Mercado Pago Checkout Pro</strong></span>
          </div>
          <button class="mp-close-btn" type="button" onclick="MercadoPagoGateway.close()">&times;</button>
        </div>

        <div class="mp-header-brand-row">
          <h2 class="mp-brand-logo" id="mp-checkout-store-title">CAPFIT</h2>
          <div class="mp-protected-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>Pago directo al vendedor</span>
          </div>
        </div>

        <div class="mp-scrollable-content">
          <!-- Resumen de productos del carrito -->
          <div class="mp-product-summary-card">
            <img id="mp-main-item-img" src="assets/gorras/Gorra_negra_frente.webp" alt="Producto">
            <div class="mp-product-main-info">
              <h3 id="mp-main-item-title">Producto</h3>
              <p class="mp-product-meta" id="mp-main-item-qty">Cantidad: 1</p>
              <p class="mp-product-meta" id="mp-main-shipping-label">Envío a todo el país</p>
            </div>
            <div class="mp-product-price-col">
              <span class="mp-product-price-val" id="mp-main-item-price" style="font-variant-numeric:tabular-nums">$0</span>
              <button class="mp-detail-toggle-btn" type="button" onclick="MercadoPagoGateway.toggleOrderDetails()">
                <span>Ver detalle</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
          </div>

          <!-- Lista desplegable de ítems -->
          <div class="mp-order-details-drawer" id="mp-order-details-drawer" style="display:none;">
            <div class="mp-items-list" id="mp-modal-items-list"></div>
          </div>

          <!-- Estado: Tienda sin Mercado Pago conectado -->
          <div class="mp-modal-body" id="mp-step-not-connected" style="display:none;padding:22px">
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:18px;margin-bottom:18px">
              <h4 style="margin:0 0 6px;color:#92400e;font-size:1rem;font-weight:700">
                Pagos con Mercado Pago no disponibles aún en esta tienda
              </h4>
              <p style="margin:0;color:#78350f;font-size:0.88rem;line-height:1.5" id="mp-not-connected-msg">
                El propietario de esta tienda todavía no vinculó su cuenta de Mercado Pago. Por seguridad, el pago está deshabilitado hasta que la tienda configure su método de cobro.
              </p>
            </div>
            <button type="button" class="mp-submit-btn" disabled style="opacity:0.55;cursor:not-allowed;background:#94a3b8">
              <span>Pago con Mercado Pago Deshabilitado</span>
            </button>
          </div>

          <!-- Paso 1: Formulario de Datos de Envío y Redirección a Checkout Pro -->
          <div class="mp-modal-body" id="mp-step-shipping" style="display:none;">
            <h3 class="mp-section-title" style="margin-bottom:6px">Completá tus datos de envío</h3>
            <p style="font-size:0.83rem;color:#64748b;margin:0 0 16px">
              Luego de confirmar tus datos de entrega te redirigiremos a <strong>Mercado Pago Checkout Pro</strong> para abonar con tarjeta, dinero en cuenta, QR o efectivo.
            </p>

            <div id="mp-checkout-error-box" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 14px;border-radius:8px;font-size:0.84rem;font-weight:600;margin-bottom:14px"></div>

            <form class="mp-form" id="mp-shipping-checkout-form" onsubmit="MercadoPagoGateway.submitCheckoutPro(event)">
              <div class="mp-field-group">
                <label for="mp-ship-name">Nombre y apellido quien recibe</label>
                <input type="text" id="mp-ship-name" placeholder="Ej: Juan Pérez" required>
              </div>

              <div class="mp-field-row" style="grid-template-columns:1fr 1fr">
                <div class="mp-field-group">
                  <label for="mp-ship-email">Correo electrónico</label>
                  <input type="email" id="mp-ship-email" placeholder="tu@email.com" required>
                </div>
                <div class="mp-field-group">
                  <label for="mp-ship-phone">Teléfono / WhatsApp</label>
                  <input type="tel" id="mp-ship-phone" placeholder="+54 9 11 5555-0000" required>
                </div>
              </div>

              <div class="mp-field-group">
                <label for="mp-ship-address">Dirección de entrega (Calle, altura, piso/depto)</label>
                <input type="text" id="mp-ship-address" placeholder="Ej: Av. Santa Fe 3200, Piso 4B" required>
              </div>

              <div class="mp-field-row" style="grid-template-columns:2fr 1fr">
                <div class="mp-field-group">
                  <label for="mp-ship-city">Ciudad / Localidad</label>
                  <input type="text" id="mp-ship-city" placeholder="Ej: CABA / Córdoba" required>
                </div>
                <div class="mp-field-group">
                  <label for="mp-ship-zip">Código Postal</label>
                  <input type="text" id="mp-ship-zip" placeholder="1425" required>
                </div>
              </div>

              <div class="mp-field-group">
                <label for="mp-ship-notes">Notas para el envío (Opcional)</label>
                <input type="text" id="mp-ship-notes" placeholder="Ej: Timbre 4B, entregar en recepción">
              </div>

              <button type="submit" class="mp-submit-btn" id="btn-mp-redirect-checkout" style="margin-top:10px">
                <span>Ir a Pagar en Mercado Pago</span>
                <span class="mp-btn-amount" id="mp-btn-total-amount" style="font-variant-numeric:tabular-nums">$0</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            </form>

            <div class="mp-footer-guarantee" style="margin-top:16px">
              <div class="mp-foot-guar-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                <span>Precios validados en servidor</span>
              </div>
              <span class="mp-foot-divider">·</span>
              <div class="mp-foot-guar-item">
                <span>Checkout Pro Oficial</span>
              </div>
            </div>
          </div>

          <!-- Paso 2: Procesando / Redirigiendo a Mercado Pago -->
          <div class="mp-modal-body mp-center-state" id="mp-step-processing" style="display:none;">
            <div class="mp-spinner"></div>
            <h3 class="mp-process-title" id="mp-processing-title">Generando preferencia en Mercado Pago...</h3>
            <p class="mp-process-sub" id="mp-processing-sub">Validando stock y conectando con la cuenta del vendedor.</p>
          </div>

          <!-- Paso 2.5: Entorno Sandbox de Prueba de Checkout Pro (solo cuando el vendedor usa token TEST-SANDBOX) -->
          <div class="mp-modal-body" id="mp-step-sandbox-simulator" style="display:none;padding:22px">
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:18px">
              <div style="font-size:0.75rem;color:#1d4ed8;font-weight:700;margin-bottom:4px">
                MODO PRUEBA MULTI-TENANT · MERCADO PAGO CHECKOUT PRO
              </div>
              <h4 style="margin:0 0 6px;color:#1e3a8a;font-size:1.02rem;font-weight:800" id="mp-sandbox-seller-title">
                Pasarela de prueba del vendedor
              </h4>
              <p style="margin:0;color:#1e40af;font-size:0.84rem;line-height:1.45">
                Orden creada como <strong>Pendiente</strong> en el servidor con referencia externa única. Elegí el resultado del pago en Checkout Pro para disparar la confirmación por Webhook:
              </p>
            </div>

            <div style="display:grid;gap:10px">
              <button type="button" class="mp-submit-btn" style="background:#16a34a" onclick="MercadoPagoGateway.simulateSandboxReturn('approved')">
                <span>Simular Pago Aprobado en Checkout Pro</span>
              </button>
              <button type="button" class="mp-submit-btn" style="background:#d97706" onclick="MercadoPagoGateway.simulateSandboxReturn('pending')">
                <span>Simular Pago Pendiente (Efectivo / Rapipago)</span>
              </button>
              <button type="button" class="mp-submit-btn" style="background:#dc2626" onclick="MercadoPagoGateway.simulateSandboxReturn('rejected')">
                <span>Simular Pago Rechazado (Restaura Stock)</span>
              </button>
            </div>
          </div>

          <!-- Paso 3: Comprobante de Retorno (Aprobado / Pendiente / Rechazado) -->
          <div class="mp-modal-body mp-center-state" id="mp-step-receipt" style="display:none;">
            <div class="mp-success-check" id="mp-receipt-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 class="mp-success-title" id="mp-receipt-heading">¡Pago Aprobado!</h3>
            <p class="mp-success-sub" id="mp-receipt-subheading">Tu compra fue procesada directamente con la tienda.</p>

            <div class="mp-receipt-card" style="font-variant-numeric:tabular-nums">
              <div class="mp-receipt-row">
                <span>Tienda Vendedora:</span>
                <strong id="mp-receipt-store-name">CAPFIT</strong>
              </div>
              <div class="mp-receipt-row">
                <span>Número de Orden:</span>
                <strong id="mp-receipt-order-num">#MP-000000</strong>
              </div>
              <div class="mp-receipt-row">
                <span>Monto Total:</span>
                <strong id="mp-receipt-amount">$0</strong>
              </div>
              <div class="mp-receipt-row">
                <span>Medio de Pago:</span>
                <strong id="mp-receipt-method">Mercado Pago Checkout Pro</strong>
              </div>
              <div class="mp-receipt-row">
                <span>Estado del Pago:</span>
                <strong id="mp-receipt-status-text" style="color:#15803d">Aprobado</strong>
              </div>
            </div>

            <button class="mp-success-btn" type="button" onclick="MercadoPagoGateway.finishOrder()">
              Volver a la tienda
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) MercadoPagoGateway.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display !== 'none') {
        MercadoPagoGateway.close();
      }
    });

    return modal;
  }

  function showStep(stepId) {
    const steps = [
      'mp-step-not-connected',
      'mp-step-shipping',
      'mp-step-processing',
      'mp-step-sandbox-simulator',
      'mp-step-receipt'
    ];
    steps.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = id === stepId ? (id === 'mp-step-processing' || id === 'mp-step-receipt' ? 'flex' : 'block') : 'none';
      }
    });
  }

  function prefillCustomerShippingForm() {
    try {
      const user = (window.CapfitCustomer && typeof window.CapfitCustomer.getUser === 'function')
        ? window.CapfitCustomer.getUser()
        : null;
      const defaultAddr = (window.CapfitCustomer && typeof window.CapfitCustomer.getDefaultAddress === 'function')
        ? window.CapfitCustomer.getDefaultAddress()
        : null;

      const nameEl = document.getElementById('mp-ship-name');
      const emailEl = document.getElementById('mp-ship-email');
      const phoneEl = document.getElementById('mp-ship-phone');
      const addrEl = document.getElementById('mp-ship-address');
      const cityEl = document.getElementById('mp-ship-city');
      const zipEl = document.getElementById('mp-ship-zip');

      if (user) {
        if (nameEl && !nameEl.value && user.displayName) nameEl.value = user.displayName;
        if (emailEl && !emailEl.value && user.email) emailEl.value = user.email;
        if (phoneEl && !phoneEl.value && user.phone) phoneEl.value = user.phone;
      }
      if (defaultAddr) {
        const fullStreet = `${defaultAddr.street || ''} ${defaultAddr.number || ''} ${defaultAddr.floorApt || ''}`.trim();
        if (addrEl && !addrEl.value && fullStreet) addrEl.value = fullStreet;
        if (cityEl && !cityEl.value && defaultAddr.city) cityEl.value = defaultAddr.city;
        if (zipEl && !zipEl.value && defaultAddr.postalCode) zipEl.value = defaultAddr.postalCode;
      }
    } catch (_) {}
  }

  function renderReceiptState(order, storeName) {
    renderModalHTML();
    const modal = document.getElementById('mp-checkout-modal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    showStep('mp-step-receipt');

    const payStatus = (order && order.paymentStatus) || 'Pendiente';
    const isApproved = payStatus === 'Aprobado';
    const isPending = payStatus === 'Pendiente';

    const headingEl = document.getElementById('mp-receipt-heading');
    const subEl = document.getElementById('mp-receipt-subheading');
    const iconWrap = document.getElementById('mp-receipt-icon-wrap');
    const statusTextEl = document.getElementById('mp-receipt-status-text');

    if (headingEl) {
      headingEl.textContent = isApproved
        ? '¡Pago Aprobado!'
        : (isPending ? 'Pago en Proceso de Acreditación' : 'Pago No Completado');
    }
    if (subEl) {
      subEl.textContent = isApproved
        ? 'El pago se acreditó directamente en la cuenta de Mercado Pago de la tienda.'
        : (isPending
            ? 'Tu orden quedó registrada como Pendiente. Apenas Mercado Pago confirme el pago, actualizaremos el estado automáticamente.'
            : 'El pago fue rechazado o cancelado en Mercado Pago. El stock fue liberado.');
    }
    if (iconWrap) {
      iconWrap.style.background = isApproved ? '#dcfce7' : (isPending ? '#fef3c7' : '#fee2e2');
      iconWrap.style.color = isApproved ? '#16a34a' : (isPending ? '#d97706' : '#dc2626');
    }
    if (statusTextEl) {
      statusTextEl.textContent = payStatus;
      statusTextEl.style.color = isApproved ? '#15803d' : (isPending ? '#b45309' : '#b91c1c');
    }

    const storeNameEl = document.getElementById('mp-receipt-store-name');
    if (storeNameEl) storeNameEl.textContent = storeName || (_activeStore && _activeStore.name) || 'Tienda';

    const orderNumEl = document.getElementById('mp-receipt-order-num');
    if (orderNumEl) orderNumEl.textContent = (order && order.id) || '#MP-ORD';

    const amountEl = document.getElementById('mp-receipt-amount');
    if (amountEl) amountEl.textContent = formatPrice((order && order.total) || 0);

    // Si fue aprobado o quedó pendiente de acreditación, vaciar carrito
    if ((isApproved || isPending) && window.Cart) {
      window.Cart.clearCart();
    }
    if (window.Catalogo && typeof window.Catalogo.reload === 'function') {
      window.Catalogo.reload();
    }
  }

  return {
    async open() {
      const { items, shipping, total } = getOrderData();

      if (!items || items.length === 0) {
        if (window.showToast) window.showToast('Tu carrito está vacío');
        return;
      }

      const modal = renderModalHTML();
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      showStep('mp-step-processing');
      const procTitle = document.getElementById('mp-processing-title');
      const procSub = document.getElementById('mp-processing-sub');
      if (procTitle) procTitle.textContent = 'Verificando tienda y pasarela...';
      if (procSub) procSub.textContent = 'Comprobando conexión con Mercado Pago.';

      // Actualizar resumen del carrito en el encabezado del modal
      const firstItem = items[0];
      if (firstItem && firstItem.product) {
        const imgEl = document.getElementById('mp-main-item-img');
        const titleEl = document.getElementById('mp-main-item-title');
        const qtyEl = document.getElementById('mp-main-item-qty');
        const shipEl = document.getElementById('mp-main-shipping-label');

        if (imgEl) imgEl.src = firstItem.product.imgPreview || 'assets/gorras/Gorra_negra_frente.webp';
        if (titleEl) titleEl.textContent = firstItem.product.nombre + (items.length > 1 ? ` (+${items.length - 1} más)` : '');
        if (qtyEl) qtyEl.textContent = `Unidades totales: ${items.reduce((acc, it) => acc + (it.quantity || 1), 0)}`;
        if (shipEl) shipEl.textContent = shipping === 0 ? 'Envío gratis incluido' : `Envío estándar: ${formatPrice(shipping)}`;
      }

      const totalFormatted = formatPrice(total);
      const mainPriceEl = document.getElementById('mp-main-item-price');
      if (mainPriceEl) mainPriceEl.textContent = totalFormatted;

      const btnTotalEl = document.getElementById('mp-btn-total-amount');
      if (btnTotalEl) btnTotalEl.textContent = totalFormatted;

      const itemsContainer = document.getElementById('mp-modal-items-list');
      if (itemsContainer) {
        itemsContainer.innerHTML = items.map((item) => `
          <div class="mp-item-row">
            <img src="${escapeHtml(item.product.imgPreview)}" alt="${escapeHtml(item.product.nombre)}">
            <div class="mp-item-details">
              <strong>${escapeHtml(item.product.nombre)}</strong>
              <small>Cant: ${item.quantity} · Color: ${escapeHtml(item.selectedColor?.name || 'Único')}</small>
            </div>
            <span class="mp-item-price" style="font-variant-numeric:tabular-nums">${formatPrice(item.product.precio * item.quantity)}</span>
          </div>
        `).join('');
      }

      // Consultar estado actualizado de la tienda en el backend
      const store = await fetchFreshStoreStatus();
      const storeTitleEl = document.getElementById('mp-checkout-store-title');
      if (storeTitleEl) {
        storeTitleEl.textContent = (store && store.name) ? store.name.toUpperCase() : 'CAPFIT';
      }

      // 1. Verificar si la tienda está suspendida por vencimiento > 7 días
      if (store && store.subscriptionAccess && store.subscriptionAccess.canReceiveOrders === false) {
        const msgEl = document.getElementById('mp-not-connected-msg');
        if (msgEl) {
          msgEl.textContent = store.subscriptionAccess.reason || 'Esta tienda se encuentra temporalmente suspendida y no puede recibir pedidos en este momento.';
        }
        showStep('mp-step-not-connected');
        return;
      }

      // 2. Verificar si el dueño de la tienda conectó su cuenta de Mercado Pago
      if (!store || !store.mpConnected) {
        const msgEl = document.getElementById('mp-not-connected-msg');
        if (msgEl) {
          msgEl.textContent = `El propietario de "${(store && store.name) || 'esta tienda'}" todavía no conectó su cuenta de Mercado Pago. El pago online permanecerá deshabilitado hasta que la tienda configure su cuenta en Configuración → Métodos de pago.`;
        }
        showStep('mp-step-not-connected');
        return;
      }

      // 3. Mostrar formulario de datos de envío antes de redirigir a Checkout Pro
      const errBox = document.getElementById('mp-checkout-error-box');
      if (errBox) errBox.style.display = 'none';
      prefillCustomerShippingForm();
      showStep('mp-step-shipping');
    },

    close() {
      const modal = document.getElementById('mp-checkout-modal');
      if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
      }
    },

    toggleOrderDetails() {
      const drawer = document.getElementById('mp-order-details-drawer');
      if (drawer) {
        drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
      }
    },

    async submitCheckoutPro(event) {
      if (event) event.preventDefault();

      const errBox = document.getElementById('mp-checkout-error-box');
      if (errBox) errBox.style.display = 'none';

      const name = document.getElementById('mp-ship-name')?.value?.trim() || '';
      const email = document.getElementById('mp-ship-email')?.value?.trim() || '';
      const phone = document.getElementById('mp-ship-phone')?.value?.trim() || '';
      const address = document.getElementById('mp-ship-address')?.value?.trim() || '';
      const city = document.getElementById('mp-ship-city')?.value?.trim() || '';
      const postalCode = document.getElementById('mp-ship-zip')?.value?.trim() || '';
      const notes = document.getElementById('mp-ship-notes')?.value?.trim() || '';

      if (!name || !email || !phone || !address || !city || !postalCode) {
        if (errBox) {
          errBox.textContent = 'Por favor completá todos los datos de contacto y dirección de entrega.';
          errBox.style.display = 'block';
        }
        return;
      }

      const { items } = getOrderData();
      const storeId = getActiveStoreId();
      const user = (window.CapfitCustomer && typeof window.CapfitCustomer.getUser === 'function')
        ? window.CapfitCustomer.getUser()
        : null;

      showStep('mp-step-processing');
      const procTitle = document.getElementById('mp-processing-title');
      const procSub = document.getElementById('mp-processing-sub');
      if (procTitle) procTitle.textContent = 'Creando tu orden y preferencia en Mercado Pago...';
      if (procSub) procSub.textContent = 'Validando stock y precios reales con la tienda.';

      try {
        const headers = { 'Content-Type': 'application/json' };
        const fbUser = (window.CapfitAuth && typeof window.CapfitAuth.getCurrentUser === 'function')
          ? window.CapfitAuth.getCurrentUser()
          : null;
        if (fbUser && typeof fbUser.getIdToken === 'function') {
          try {
            const idToken = await fbUser.getIdToken();
            if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
          } catch (_) {}
        }

        const payload = {
          storeId,
          userId: user ? user.uid : null,
          buyerEmail: email,
          customer: {
            name,
            email,
            phone,
            address,
            city,
            postalCode
          },
          notes,
          items: items.map((it) => ({
            id: it.product.id,
            nombre: it.product.nombre,
            color: it.selectedColor?.name || 'Único',
            colorHex: it.selectedColor?.hex || '#111111',
            quantity: it.quantity,
            precio: it.product.precio,
            imgPreview: it.product.imgPreview
          }))
        };

        const res = await fetch(`/api/payments/mp/create-preference?store=${encodeURIComponent(storeId)}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'No se pudo generar el checkout de Mercado Pago.');
        }

        _lastCreatedOrder = data.order;

        // Si es una preferencia real de Mercado Pago (https://www.mercadopago...), redirigir a Checkout Pro
        const targetUrl = data.initPoint || data.sandboxInitPoint;
        if (targetUrl && !targetUrl.includes('mp_sandbox_checkout=1')) {
          window.location.href = targetUrl;
          return;
        }

        // Si la tienda está usando un token Sandbox local (TEST-SANDBOX-...), mostrar el simulador de retorno de Checkout Pro
        const sellerTitle = document.getElementById('mp-sandbox-seller-title');
        if (sellerTitle) {
          sellerTitle.textContent = `Checkout Pro — ${data.storeName || storeId} (Orden ${data.order.id})`;
        }
        showStep('mp-step-sandbox-simulator');
      } catch (err) {
        showStep('mp-step-shipping');
        if (errBox) {
          errBox.textContent = err.message || 'Error al iniciar el pago con Mercado Pago.';
          errBox.style.display = 'block';
        }
      }
    },

    async simulateSandboxReturn(mpStatus) {
      if (!_lastCreatedOrder) return;
      const storeId = getActiveStoreId();
      const paymentId = `SANDBOX_PAY_${Date.now()}`;

      showStep('mp-step-processing');
      const procTitle = document.getElementById('mp-processing-title');
      if (procTitle) procTitle.textContent = 'Confirmando notificación de pago...';

      try {
        const res = await fetch('/api/payments/mp/verify-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            orderId: _lastCreatedOrder.id,
            paymentId,
            sandboxStatus: mpStatus
          })
        });
        const data = await res.json();
        const updatedOrder = (data && data.order) || _lastCreatedOrder;
        renderReceiptState(updatedOrder, _activeStore && _activeStore.name);
      } catch (_) {
        renderReceiptState(_lastCreatedOrder, _activeStore && _activeStore.name);
      }
    },

    async handleCheckoutReturnFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search);
        const mpReturn = params.get('mp_return');
        const orderId = params.get('order_id') || params.get('external_reference');
        const paymentId = params.get('payment_id') || params.get('collection_id');
        const storeId = params.get('store') || getActiveStoreId();

        if (!mpReturn || !orderId) return;

        await fetchFreshStoreStatus();
        const verifyUrl = `/api/payments/mp/verify-order?store=${encodeURIComponent(storeId)}&order_id=${encodeURIComponent(orderId)}${paymentId ? `&payment_id=${encodeURIComponent(paymentId)}` : ''}`;
        const res = await fetch(verifyUrl);
        if (res.ok) {
          const data = await res.json();
          if (data && data.order) {
            renderReceiptState(data.order, _activeStore && _activeStore.name);
          }
        }

        // Limpiar parámetros de retorno de la URL sin recargar
        params.delete('mp_return');
        params.delete('order_id');
        params.delete('payment_id');
        params.delete('collection_id');
        params.delete('collection_status');
        params.delete('status');
        params.delete('preference_id');
        const cleanQuery = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (cleanQuery ? `?${cleanQuery}` : '') + window.location.hash);
      } catch (e) {
        console.warn('[MercadoPagoGateway] Error verificando retorno de Checkout Pro:', e);
      }
    },

    finishOrder() {
      this.close();
      if (window.navigateToView) window.navigateToView('inicio');
      if (window.showToast) window.showToast('¡Gracias por tu visita!');
    }
  };
})();

window.MercadoPagoGateway = MercadoPagoGateway;
window.addEventListener('DOMContentLoaded', () => {
  if (window.MercadoPagoGateway && typeof window.MercadoPagoGateway.handleCheckoutReturnFromUrl === 'function') {
    window.MercadoPagoGateway.handleCheckoutReturnFromUrl();
  }
});
