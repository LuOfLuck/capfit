// ── CAPFIT Mercado Pago Gateway Module ──

const MercadoPagoGateway = (() => {
  let activeTab = 'card'; // 'card', 'account', 'qr', 'cash'

  function formatPrice(num) {
    return '$' + Math.round(num).toLocaleString('es-AR');
  }

  function getOrderData() {
    const items = window.Cart ? window.Cart.getItems() : [];
    const subtotal = window.Cart ? window.Cart.getSubtotal() : 0;
    const isFreeShipping = window.Cart ? (window.Cart.getFreeShippingRemaining() === 0) : true;
    const shipping = isFreeShipping ? 0 : 3500;
    const total = subtotal + shipping;
    return { items, subtotal, shipping, total, isFreeShipping };
  }

  function renderModalHTML() {
    let modal = document.getElementById('mp-checkout-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'mp-checkout-modal';
    modal.className = 'mp-modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="mp-modal-card">
        <!-- Top Navigation Header -->
        <div class="mp-header-top">
          <div class="mp-top-security">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Pago seguro con <strong>Mercado Pago</strong></span>
          </div>
          <button class="mp-close-btn" onclick="MercadoPagoGateway.close()">&times;</button>
        </div>

        <div class="mp-header-brand-row">
          <h2 class="mp-brand-logo">CAPFIT</h2>
          <div class="mp-protected-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            <span>Tus datos están protegidos</span>
          </div>
        </div>

        <div class="mp-scrollable-content">
          <!-- Main Product Card Summary (Matches Screenshot 1) -->
          <div class="mp-product-summary-card">
            <img id="mp-main-item-img" src="assets/gorras/Gorra_negra_frente.webp" alt="Gorra">
            <div class="mp-product-main-info">
              <h3 id="mp-main-item-title">Gorra CAPFIT Premium</h3>
              <p class="mp-product-meta">Talle: Ajustable</p>
              <p class="mp-product-meta" id="mp-main-item-qty">Cantidad: 1</p>
            </div>
            <div class="mp-product-price-col">
              <span class="mp-product-price-val" id="mp-main-item-price">$31.400</span>
              <button class="mp-detail-toggle-btn" onclick="MercadoPagoGateway.toggleOrderDetails()">
                <span>Ver detalle</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
          </div>

          <!-- Collapsible Order Details Drawer -->
          <div class="mp-order-details-drawer" id="mp-order-details-drawer" style="display:none;">
            <div class="mp-items-list" id="mp-modal-items-list"></div>
          </div>

          <!-- Promo Banner (Matches Green Banner in Screenshot 1) -->
          <div class="mp-promo-banner">
            <div class="mp-promo-icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
            </div>
            <div class="mp-promo-text-col">
              <strong>Hasta 6 cuotas sin interés</strong>
              <span>Con tarjetas seleccionadas</span>
            </div>
            <svg class="mp-arrow-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>

          <!-- Step 1: Payment Selection & Inputs -->
          <div class="mp-modal-body" id="mp-step-selection">
            <h3 class="mp-section-title">Elegí cómo querés pagar</h3>

            <!-- Method Selector Tabs (4 Columns like Screenshot 1) -->
            <div class="mp-method-tabs">
              <button class="mp-tab-btn active" data-tab="card" onclick="MercadoPagoGateway.switchTab('card')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span>Tarjeta</span>
              </button>
              <button class="mp-tab-btn" data-tab="account" onclick="MercadoPagoGateway.switchTab('account')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 9.5H10.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H9"/></svg>
                <span>Dinero en MP</span>
              </button>
              <button class="mp-tab-btn" data-tab="qr" onclick="MercadoPagoGateway.switchTab('qr')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span>QR / CVU</span>
              </button>
              <button class="mp-tab-btn" data-tab="cash" onclick="MercadoPagoGateway.switchTab('cash')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
                <span>Efectivo</span>
              </button>
            </div>

            <!-- Tab Content: Card -->
            <div class="mp-tab-pane active" id="mp-pane-card">
              <div class="mp-cards-accepted-strip">
                <span class="mp-accepted-label">Tarjetas aceptadas</span>
                <div class="mp-cards-logos-wrap">
                  <span class="mp-card-logo-pill visa">VISA</span>
                  <span class="mp-card-logo-pill mastercard">Mastercard</span>
                  <span class="mp-card-logo-pill amex">AMEX</span>
                  <span class="mp-card-logo-pill cabal">CABAL</span>
                </div>
              </div>

              <form class="mp-form" onsubmit="event.preventDefault(); MercadoPagoGateway.processPayment('card');">
                <div class="mp-field-group">
                  <label>Número de tarjeta</label>
                  <div class="mp-input-wrap">
                    <input type="text" id="mp-card-number" placeholder="4092 3078 6371 1073" maxlength="19" required oninput="MercadoPagoGateway.formatCardInput(this)">
                    <div class="mp-input-right-actions">
                      <span class="mp-card-brand-tag">VISA</span>
                      <button type="button" class="mp-cam-scan-btn" title="Escanear tarjeta">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mp-field-group">
                  <label>Nombre y apellido impreso en la tarjeta</label>
                  <input type="text" id="mp-card-holder" placeholder="Lucas Guerrero" required>
                </div>

                <div class="mp-field-row">
                  <div class="mp-field-group">
                    <label>Vencimiento</label>
                    <input type="text" id="mp-card-expiry" placeholder="12/32" maxlength="5" required oninput="MercadoPagoGateway.formatExpiryInput(this)">
                  </div>
                  <div class="mp-field-group">
                    <label>CVC / Cód.</label>
                    <div class="mp-input-wrap">
                      <input type="password" id="mp-card-cvc" placeholder="123" maxlength="4" required>
                      <span class="mp-help-icon" title="Código de 3 dígitos al dorso">?</span>
                    </div>
                  </div>
                  <div class="mp-field-group">
                    <label>DNI Titular</label>
                    <input type="text" id="mp-card-dni" placeholder="12.345.678" required>
                  </div>
                </div>

                <div class="mp-field-group">
                  <label>Cuotas</label>
                  <select id="mp-installments-select" class="mp-select">
                    <option value="1">1 cuota de $31.400 (Sin interés)</option>
                    <option value="3">3 cuotas sin interés de $10.466</option>
                    <option value="6" selected>6 cuotas sin interés de $5.233 (Recomendado)</option>
                  </select>
                </div>

                <button type="submit" class="mp-submit-btn">
                  <span>Pagar</span>
                  <span class="mp-btn-amount" id="mp-btn-card-amount">$31.400</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </button>
              </form>
            </div>

            <!-- Tab Content: Dinero en Cuenta MP -->
            <div class="mp-tab-pane" id="mp-pane-account" style="display:none;">
              <div class="mp-account-box">
                <div class="mp-account-header">
                  <div class="mp-avatar">💙</div>
                  <div>
                    <strong>Tu cuenta de Mercado Pago</strong>
                    <p>lucasg33322@gmail.com</p>
                  </div>
                  <span class="mp-verified-badge">✔ Verificado</span>
                </div>
                <div class="mp-balance-row">
                  <span>Saldo disponible:</span>
                  <strong class="mp-balance-val">$185.000,00</strong>
                </div>
                <div class="mp-account-note">
                  ⚡ Descuento inmediato. Sin necesidad de ingresar datos de tarjetas.
                </div>
              </div>

              <button type="button" class="mp-submit-btn" onclick="MercadoPagoGateway.processPayment('account')">
                <span>Pagar con Saldo MP</span>
                <span class="mp-btn-amount" id="mp-btn-account-amount">$31.400</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </button>
            </div>

            <!-- Tab Content: QR / CVU Transfer -->
            <div class="mp-tab-pane" id="mp-pane-qr" style="display:none;">
              <div class="mp-qr-box">
                <div class="mp-qr-img-wrap">
                  <svg class="mp-qr-svg" viewBox="0 0 100 100">
                    <rect x="0" y="0" width="100" height="100" fill="#ffffff"/>
                    <rect x="10" y="10" width="25" height="25" fill="#0f172a"/>
                    <rect x="15" y="15" width="15" height="15" fill="#ffffff"/>
                    <rect x="18" y="18" width="9" height="9" fill="#0f172a"/>

                    <rect x="65" y="10" width="25" height="25" fill="#0f172a"/>
                    <rect x="70" y="15" width="15" height="15" fill="#ffffff"/>
                    <rect x="73" y="18" width="9" height="9" fill="#0f172a"/>

                    <rect x="10" y="65" width="25" height="25" fill="#0f172a"/>
                    <rect x="15" y="70" width="15" height="15" fill="#ffffff"/>
                    <rect x="18" y="73" width="9" height="9" fill="#0f172a"/>

                    <rect x="42" y="12" width="6" height="6" fill="#009ee3"/>
                    <rect x="50" y="18" width="8" height="8" fill="#0f172a"/>
                    <rect x="40" y="30" width="10" height="10" fill="#009ee3"/>
                    <rect x="55" y="32" width="8" height="8" fill="#0f172a"/>
                    <rect x="12" y="42" width="8" height="8" fill="#0f172a"/>
                    <rect x="25" y="45" width="10" height="10" fill="#009ee3"/>
                    <rect x="42" y="48" width="12" height="12" fill="#0f172a"/>
                    <rect x="68" y="42" width="8" height="8" fill="#009ee3"/>
                    <rect x="80" y="50" width="10" height="10" fill="#0f172a"/>
                    <rect x="45" y="68" width="10" height="10" fill="#009ee3"/>
                    <rect x="62" y="68" width="12" height="12" fill="#0f172a"/>
                    <rect x="78" y="72" width="10" height="10" fill="#009ee3"/>
                  </svg>
                </div>
                <div class="mp-qr-info">
                  <strong>Escaneá con la app de Mercado Pago</strong>
                  <p>Abrí la app, elegí "Escanear QR" y apuntá a esta pantalla.</p>
                  <div class="mp-cvu-copy-box">
                    <span>Alias: <strong>capfit.tienda.mp</strong></span>
                    <button type="button" class="btn-copy-alias" onclick="navigator.clipboard.writeText('capfit.tienda.mp'); if(window.showToast) showToast('¡Alias copiado!');">Copiar</button>
                  </div>
                </div>
              </div>

              <button type="button" class="mp-submit-btn" onclick="MercadoPagoGateway.processPayment('qr')">
                <span>Ya transferí / Acreditar pago</span>
              </button>
            </div>

            <!-- Tab Content: Cash -->
            <div class="mp-tab-pane" id="mp-pane-cash" style="display:none;">
              <div class="mp-cash-box">
                <div class="mp-cash-item">
                  <strong>Pago Fácil / Rapipago</strong>
                  <p>Te daremos un código de 8 dígitos para abonar en cualquier sucursal del país.</p>
                </div>
                <div class="mp-cash-item">
                  <strong>Acreditación instantánea</strong>
                  <p>Tu pedido se procesará automáticamente apenas efectúes el pago.</p>
                </div>
              </div>

              <button type="button" class="mp-submit-btn" onclick="MercadoPagoGateway.processPayment('cash')">
                <span>Generar cupón de pago</span>
              </button>
            </div>

            <!-- Footer Trust Note (Matches Screenshot 1 Footer) -->
            <div class="mp-footer-guarantee">
              <div class="mp-foot-guar-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                <span>SSL 256-bit</span>
              </div>
              <span class="mp-foot-divider">|</span>
              <div class="mp-foot-guar-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/></svg>
                <span>Procesa Mercado Pago</span>
              </div>
            </div>
          </div>

          <!-- Step 2: Loading / Processing Screen -->
          <div class="mp-modal-body mp-center-state" id="mp-step-processing" style="display:none;">
            <div class="mp-spinner"></div>
            <h3 class="mp-process-title">Conectando con Mercado Pago...</h3>
            <p class="mp-process-sub">Procesando tu pago de forma segura. No cierres esta ventana.</p>
          </div>

          <!-- Step 3: Success Receipt Screen -->
          <div class="mp-modal-body mp-center-state" id="mp-step-success" style="display:none;">
            <div class="mp-success-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 class="mp-success-title">¡Pago Aprobado!</h3>
            <p class="mp-success-sub">Tu compra ha sido procesada con éxito.</p>

            <div class="mp-receipt-card">
              <div class="mp-receipt-row">
                <span>Número de Orden:</span>
                <strong id="mp-receipt-order-num">#MP-849201</strong>
              </div>
              <div class="mp-receipt-row">
                <span>Monto abonado:</span>
                <strong id="mp-receipt-amount">$31.400</strong>
              </div>
              <div class="mp-receipt-row">
                <span>Medio de pago:</span>
                <strong id="mp-receipt-method">Mercado Pago</strong>
              </div>
              <div class="mp-receipt-row">
                <span>Estado:</span>
                <span class="mp-status-pill">Aprobado</span>
              </div>
            </div>

            <p class="mp-email-notice">Te enviamos el comprobante y detalle de seguimiento a tu correo.</p>

            <button class="mp-success-btn" onclick="MercadoPagoGateway.finishOrder()">
              Volver a CAPFIT
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  return {
    open() {
      const { items, total } = getOrderData();

      if (!items || items.length === 0) {
        if (window.showToast) window.showToast('Tu carrito está vacío');
        return;
      }

      const modal = renderModalHTML();
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      // Reset states
      document.getElementById('mp-step-selection').style.display = 'block';
      document.getElementById('mp-step-processing').style.display = 'none';
      document.getElementById('mp-step-success').style.display = 'none';

      // Set Main Product Card data from first item
      const firstItem = items[0];
      if (firstItem && firstItem.product) {
        const imgEl = document.getElementById('mp-main-item-img');
        const titleEl = document.getElementById('mp-main-item-title');
        const qtyEl = document.getElementById('mp-main-item-qty');

        if (imgEl) imgEl.src = firstItem.product.imgPreview || 'assets/gorras/Gorra_negra_frente.webp';
        if (titleEl) titleEl.textContent = firstItem.product.nombre + (items.length > 1 ? ` (+${items.length - 1} más)` : '');
        if (qtyEl) qtyEl.textContent = `Cantidad: ${firstItem.quantity}`;
      }

      // Set Order Amount
      const totalFormatted = formatPrice(total);
      const mainPriceEl = document.getElementById('mp-main-item-price');
      if (mainPriceEl) mainPriceEl.textContent = totalFormatted;

      const cardBtnAmount = document.getElementById('mp-btn-card-amount');
      if (cardBtnAmount) cardBtnAmount.textContent = totalFormatted;

      const accBtnAmount = document.getElementById('mp-btn-account-amount');
      if (accBtnAmount) accBtnAmount.textContent = totalFormatted;

      // Update Installments select options
      const instSelect = document.getElementById('mp-installments-select');
      if (instSelect) {
        instSelect.innerHTML = `
          <option value="1">1 cuota de ${formatPrice(total)} (Sin interés)</option>
          <option value="3">3 cuotas sin interés de ${formatPrice(total / 3)}</option>
          <option value="6" selected>6 cuotas sin interés de ${formatPrice(total / 6)} (Recomendado)</option>
        `;
      }

      // Populate Items list in drawer
      const itemsContainer = document.getElementById('mp-modal-items-list');
      if (itemsContainer) {
        itemsContainer.innerHTML = items.map(item => `
          <div class="mp-item-row">
            <img src="${item.product.imgPreview}" alt="${item.product.nombre}">
            <div class="mp-item-details">
              <strong>${item.product.nombre}</strong>
              <small>Cant: ${item.quantity} | Talle: Ajustable</small>
            </div>
            <span class="mp-item-price">${formatPrice(item.product.precio * item.quantity)}</span>
          </div>
        `).join('');
      }

      this.switchTab('card');
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

    switchTab(tab) {
      activeTab = tab;
      const tabs = document.querySelectorAll('.mp-tab-btn');
      tabs.forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-tab') === tab);
      });

      const panes = ['card', 'account', 'qr', 'cash'];
      panes.forEach(p => {
        const paneEl = document.getElementById(`mp-pane-${p}`);
        if (paneEl) {
          paneEl.style.display = p === tab ? 'block' : 'none';
        }
      });
    },

    formatCardInput(input) {
      let val = input.value.replace(/\D/g, '');
      val = val.substring(0, 16);
      val = val.replace(/(.{4})/g, '$1 ').trim();
      input.value = val;
    },

    formatExpiryInput(input) {
      let val = input.value.replace(/\D/g, '');
      if (val.length >= 2) {
        val = val.substring(0, 2) + '/' + val.substring(2, 4);
      }
      input.value = val;
    },

    processPayment(method) {
      const { total } = getOrderData();

      // Show processing state
      document.getElementById('mp-step-selection').style.display = 'none';
      document.getElementById('mp-step-processing').style.display = 'flex';

      setTimeout(() => {
        // Show success state
        document.getElementById('mp-step-processing').style.display = 'none';
        document.getElementById('mp-step-success').style.display = 'flex';

        // Order Number & details
        const randomOrderNum = '#MP-' + Math.floor(100000 + Math.random() * 900000);
        document.getElementById('mp-receipt-order-num').textContent = randomOrderNum;
        document.getElementById('mp-receipt-amount').textContent = formatPrice(total);

        let methodNameStr = 'Tarjeta de Crédito Mercado Pago';
        if (method === 'account') methodNameStr = 'Dinero en Cuenta Mercado Pago';
        if (method === 'qr') methodNameStr = 'Transferencia CVU Mercado Pago';
        if (method === 'cash') methodNameStr = 'Efectivo (Rapipago / Pago Fácil)';

        document.getElementById('mp-receipt-method').textContent = methodNameStr;
      }, 1800);
    },

    finishOrder() {
      if (window.Cart) window.Cart.clearCart();
      this.close();
      if (window.navigateToView) window.navigateToView('inicio');
      if (window.showToast) window.showToast('¡Muchas gracias por tu compra en CAPFIT!');
    }
  };
})();

window.MercadoPagoGateway = MercadoPagoGateway;
