// ── CAPFIT Main UI & View Router ──

(() => {
  // Toast notification helper
  window.showToast = function(msg) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-notification';
      toast.className = 'toast-msg';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  };

  // Custom Modal Helper
  window.showCustomModal = function(options = {}) {
    const {
      title = 'Atención',
      message = '',
      icon = 'warning',
      buttonText = 'Entendido',
      onClose = null
    } = typeof options === 'string' ? { message: options } : options;

    const existing = document.getElementById('custom-app-modal');
    if (existing) existing.remove();

    let iconSvg = '';
    let bgColor = '#fff7ed';
    let strokeColor = '#f59e0b';

    if (icon === 'camera' || icon === 'face') {
      bgColor = '#fef2f2';
      strokeColor = '#ef4444';
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2" style="width:28px;height:28px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
    } else if (icon === 'info') {
      bgColor = '#eff6ff';
      strokeColor = '#3b82f6';
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2" style="width:28px;height:28px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    } else {
      bgColor = '#fff7ed';
      strokeColor = '#f59e0b';
      iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2" style="width:28px;height:28px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    }

    const backdrop = document.createElement('div');
    backdrop.id = 'custom-app-modal';
    backdrop.className = 'mp-modal-backdrop';
    backdrop.style.zIndex = '10000';

    backdrop.innerHTML = `
      <div class="custom-modal-card" style="
        background:#ffffff;
        border-radius:24px;
        padding:26px 22px;
        width:100%;
        max-width:390px;
        text-align:center;
        box-shadow:0 25px 50px -12px rgba(15, 23, 42, 0.35);
        border:1px solid #f1f5f9;
        animation: mpSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      ">
        <div style="
          width:56px;
          height:56px;
          border-radius:50%;
          background:${bgColor};
          display:flex;
          align-items:center;
          justify-content:center;
          margin:0 auto 16px auto;
        ">
          ${iconSvg}
        </div>
        <h3 style="font-size:1.15rem;font-weight:800;color:#0f172a;margin-bottom:8px;line-height:1.3">${title}</h3>
        <p style="font-size:0.9rem;color:#475569;line-height:1.55;margin-bottom:22px;white-space:pre-line">${message}</p>
        <button id="btn-close-custom-modal" style="
          width:100%;
          padding:12px 16px;
          background:#0f172a;
          color:#ffffff;
          border:none;
          border-radius:14px;
          font-weight:700;
          font-size:0.92rem;
          cursor:pointer;
          box-shadow:0 4px 12px rgba(15,23,42,0.15);
          transition:transform 0.15s ease, background 0.15s ease;
        ">${buttonText}</button>
      </div>
    `;

    document.body.appendChild(backdrop);

    const closeBtn = backdrop.querySelector('#btn-close-custom-modal');
    const closeModal = () => {
      backdrop.remove();
      if (typeof onClose === 'function') onClose();
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  };

  // Override window.alert with custom modal
  window.alert = function(msg) {
    let title = 'Atención';
    let icon = 'warning';
    let cleanMsg = String(msg || '');

    if (cleanMsg.includes('⚠️')) {
      cleanMsg = cleanMsg.replace(/⚠️/g, '').trim();
    }

    const lower = cleanMsg.toLowerCase();
    if (lower.includes('rostro')) {
      title = 'Detección de rostro';
      icon = 'face';
    } else if (lower.includes('cámara')) {
      title = 'Acceso a cámara';
      icon = 'camera';
    } else if (lower.includes('gorra') || lower.includes('catálogo')) {
      title = 'Probar Gorra';
      icon = 'info';
    }

    window.showCustomModal({
      title,
      message: cleanMsg,
      icon,
      buttonText: 'Entendido'
    });
  };

  // View Navigation Router
  window.navigateToView = function(viewName) {
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => v.classList.remove('active-view'));

    let cleanName = (viewName || '').trim().replace(/^#\/?|^[/\\]+/, '');
    if (!cleanName) cleanName = 'inicio';
    if (cleanName === 'account' || cleanName === 'portal-duenos') cleanName = 'admin';
    if (cleanName === 'preguntas-frecuentes') cleanName = 'faq';
    if (cleanName === 'envios-y-entregas') cleanName = 'envios';
    if (cleanName === 'cambios-y-devoluciones') cleanName = 'cambios';
    if (cleanName === 'terminos-y-condiciones') cleanName = 'terminos';
    if (cleanName === 'politica-de-privacidad') cleanName = 'privacidad';

    let target = document.getElementById(`view-${cleanName}`);
    if (!target) {
      if (cleanName === '404' || cleanName.includes('404')) {
        target = document.getElementById('view-404');
      } else {
        target = document.getElementById('view-404') || document.getElementById('view-inicio');
        cleanName = target.id === 'view-404' ? '404' : 'inicio';
      }
    }

    if (target) {
      target.classList.add('active-view');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update active nav links
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.remove('active');
      const href = a.getAttribute('href') || '';
      if (href === `#${cleanName}` || href === `/${cleanName}` || (cleanName === 'admin' && (href === '#account' || href === '/account'))) {
        a.classList.add('active');
      }
    });

    // View specific initialization
    if (cleanName === 'carrito') {
      renderCartView();
    } else if (cleanName === 'probador') {
      updateTryOnViewUI();
    } else if (cleanName === 'admin') {
      if (window.AdminPanel) window.AdminPanel.init();
    } else if (cleanName === 'sobre-nosotros') {
      if (window.SobreNosotros) window.SobreNosotros.render();
    }
  };

  // Render Cart View (Image 2 design)
  function renderCartView() {
    const items = Cart.getItems();
    const container = document.getElementById('cart-items-list');
    const summarySubtotal = document.getElementById('cart-summary-subtotal');
    const summaryTotal = document.getElementById('cart-summary-total');
    const summaryShipping = document.getElementById('cart-summary-shipping');
    const freeShippingBox = document.getElementById('cart-free-shipping-box');
    const cartItemCountEls = document.querySelectorAll('.cart-item-count');

    const totalCount = Cart.getItemCount();
    cartItemCountEls.forEach(el => el.textContent = totalCount);

    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-cart-state" style="padding:48px 20px;text-align:center;background:var(--white);border-radius:var(--radius-lg);border:1px solid var(--gray-200)">
          <div style="margin-bottom:12px;color:var(--gray-400)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:48px;height:48px">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 01-8 0"></path>
            </svg>
          </div>
          <h3 style="font-size:1.3rem;font-weight:800;margin-bottom:8px">Tu carrito está vacío</h3>
          <p style="color:var(--gray-500);font-size:.88rem;margin-bottom:20px">Explorá nuestro catálogo y elegí tus gorras o anteojos favoritos.</p>
          <button onclick="navigateToView('inicio')" class="btn-hero-primary" style="margin:0 auto">
            Ver catálogo de gorras →
          </button>
        </div>
      `;
      if (summarySubtotal) summarySubtotal.textContent = '$0';
      if (summaryTotal) summaryTotal.textContent = '$0';
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="cart-item-card">
        <img src="${item.product.imgPreview}" alt="${item.product.nombre}" class="cart-item-img">

        <div class="cart-item-details">
          <h4 class="cart-item-title">${item.product.nombre}</h4>
          <div class="cart-item-meta">
            <span>Color: ${item.selectedColor?.name || 'Negro'}</span>
            <span style="width:10px;height:10px;border-radius:50%;background:${item.selectedColor?.hex || '#111'};display:inline-block"></span>
            <span>• Talle: Único (Ajustable)</span>
          </div>
          <button class="btn-tryon-cart-item" onclick="Catalogo.selectForTryOn('${item.product.id}')">
            Probar con IA
          </button>
        </div>

        <div class="cart-quantity-controls">
          <button class="btn-qty" onclick="Cart.updateQuantity('${item.product.id}', '${item.selectedColor?.hex}', ${item.quantity - 1})">-</button>
          <span class="qty-val">${item.quantity}</span>
          <button class="btn-qty" onclick="Cart.updateQuantity('${item.product.id}', '${item.selectedColor?.hex}', ${item.quantity + 1})">+</button>
        </div>

        <div class="cart-item-actions-col">
          <span class="cart-item-price">${Catalogo.formatPrecio(item.product.precio * item.quantity)}</span>
          <button class="btn-remove-item" onclick="Cart.removeFromCart('${item.product.id}', '${item.selectedColor?.hex}')">
            Eliminar
          </button>
        </div>
      </div>
    `).join('');

    // Update Summary
    const subtotal = Cart.getSubtotal();
    const remainingForFreeShipping = Cart.getFreeShippingRemaining();
    const isFreeShipping = remainingForFreeShipping === 0;

    if (summarySubtotal) summarySubtotal.textContent = Catalogo.formatPrecio(subtotal);
    if (summaryShipping) summaryShipping.textContent = isFreeShipping ? 'Gratis' : '$3.500';
    if (summaryTotal) summaryTotal.textContent = Catalogo.formatPrecio(subtotal + (isFreeShipping ? 0 : 3500));

    // Update Free Shipping Banner
    const freeShippingProgressFill = document.getElementById('free-shipping-progress-fill');
    const freeShippingMsg = document.getElementById('free-shipping-msg');

    if (freeShippingProgressFill) {
      freeShippingProgressFill.style.width = `${Cart.getFreeShippingProgress()}%`;
    }

    if (freeShippingMsg) {
      if (isFreeShipping) {
        freeShippingMsg.innerHTML = `<strong>¡Felicitaciones!</strong> Tenés envío gratis a todo el país.`;
      } else {
        freeShippingMsg.innerHTML = `<strong>¡Falta poco!</strong> Te faltan <strong>${Catalogo.formatPrecio(remainingForFreeShipping)}</strong> para tener envío gratis a todo el país.`;
      }
    }
  }

  // Update Try-On View UI (Image 3 design)
  window.updateTryOnSidebarUI = function(item) {
    const g = item || Store.getGorraActiva() || (Store.getGorras && Store.getGorras()[0]);
    if (!g) return;

    const img = document.getElementById('tryon-sidebar-img');
    const title = document.getElementById('tryon-sidebar-title');
    const price = document.getElementById('tryon-sidebar-price');
    const rating = document.getElementById('tryon-sidebar-rating');
    const badge = document.getElementById('tryon-sidebar-badge');
    const colors = document.getElementById('tryon-sidebar-colors');
    const details = document.getElementById('tryon-sidebar-details');

    if (img) img.src = g.imgPreview;
    if (title) title.textContent = g.nombre;
    if (price) price.textContent = Catalogo.formatPrecio(g.precio);
    if (rating) rating.innerHTML = `★ ${g.rating || 4.9} (${g.reviews || 128} reseñas)`;
    if (badge) {
      badge.textContent = g.badge || 'Más vendido';
      badge.style.display = 'inline-block';
    }

    if (colors && g.colores) {
      colors.innerHTML = g.colores.map((c, idx) => `
        <span class="color-dot ${idx === 0 ? 'selected' : ''}" style="background:${c.hex || c};width:18px;height:18px" title="${c.name || ''}"></span>
      `).join('');
    }

    if (details && g.detalles) {
      details.innerHTML = g.detalles.map(d => `
        <div class="attr-item">${d}</div>
      `).join('');
    }
  };

  function updateTryOnViewUI() {
    window.updateTryOnSidebarUI();
  }

  // Handle Hash & Path Changes for URL navigation
  function handleRoute() {
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const hash = window.location.hash.replace('#', '').trim();
    const host = (window.location.hostname || '').toLowerCase();
    const search = window.location.search || '';

    let viewName = 'inicio';

    // Detección del subdominio del portal de dueños (account.capfit.store)
    const isAccountPortal = (
      host === 'account.capfit.store' ||
      host.startsWith('account.') ||
      search.includes('account=true') ||
      search.includes('subdomain=account') ||
      rawPath === 'account' ||
      hash === 'account' ||
      hash === 'portal-duenos'
    );

    if (isAccountPortal) {
      viewName = 'admin';
    } else if (hash) {
      viewName = hash;
    } else if (rawPath) {
      if (rawPath === '404' || rawPath === '404.html') {
        viewName = '404';
      } else if ([
        'inicio', 'probador', 'carrito', 'admin', 'account',
        'faq', 'preguntas-frecuentes', 'envios', 'envios-y-entregas',
        'cambios', 'cambios-y-devoluciones', 'contacto',
        'sobre-nosotros', 'terminos', 'terminos-y-condiciones',
        'privacidad', 'politica-de-privacidad'
      ].includes(rawPath)) {
        let mapped = rawPath;
        if (mapped === 'account') mapped = 'admin';
        else if (mapped === 'preguntas-frecuentes') mapped = 'faq';
        else if (mapped === 'envios-y-entregas') mapped = 'envios';
        else if (mapped === 'cambios-y-devoluciones') mapped = 'cambios';
        else if (mapped === 'terminos-y-condiciones') mapped = 'terminos';
        else if (mapped === 'politica-de-privacidad') mapped = 'privacidad';
        viewName = mapped;
      } else if (!rawPath.includes('.')) {
        viewName = '404';
      }
    }

    window.navigateToView(viewName);
  }

  // Initialize Scroll-triggered animations
  window.initScrollAnimations = function() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in').forEach(el => obs.observe(el));
  };

  // Setup DOM listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Nav search inputs
    const searchInputs = document.querySelectorAll('#nav-search-input, .search-field');
    searchInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        Catalogo.setSearch(e.target.value);
        if (!document.getElementById('view-inicio').classList.contains('active-view')) {
          window.navigateToView('inicio');
        }
      });
    });

    // Hash & Path router listeners
    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('popstate', handleRoute);
    handleRoute();

    // Init animations
    window.initScrollAnimations();

    // Listen to Cart updates
    Cart.on('cart:updated', () => {
      renderCartView();
    });
  });

  // Checkout modal / Mercado Pago integration
  window.proceedToCheckout = function(provider = 'mercadopago') {
    const count = Cart.getItemCount();
    if (count === 0) {
      if (window.showToast) window.showToast('Tu carrito está vacío');
      return;
    }

    if (window.MercadoPagoGateway) {
      window.MercadoPagoGateway.open();
    } else {
      const totalStr = Catalogo.formatPrecio(Cart.getSubtotal() + (Cart.getFreeShippingRemaining() === 0 ? 0 : 3500));
      alert(`Procesando pago con Mercado Pago por ${totalStr}...`);
    }
  };

})();
