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

  // View Navigation Router
  window.navigateToView = function(viewName) {
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => v.classList.remove('active-view'));

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active-view');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update active nav links
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.remove('active');
      if (a.getAttribute('href') === `#${viewName}`) {
        a.classList.add('active');
      }
    });

    // View specific initialization
    if (viewName === 'carrito') {
      renderCartView();
    } else if (viewName === 'probador') {
      updateTryOnViewUI();
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

  // Handle Hash Changes for URL navigation (#inicio, #probador, #carrito)
  function handleHashChange() {
    const hash = window.location.hash.replace('#', '') || 'inicio';
    window.navigateToView(hash);
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

    // Hash router listener
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    // Init animations
    window.initScrollAnimations();

    // Listen to Cart updates
    Cart.on('cart:updated', () => {
      renderCartView();
    });
  });

  // Checkout modal / Mercado Pago simulation
  window.proceedToCheckout = function(provider = 'standard') {
    const count = Cart.getItemCount();
    if (count === 0) {
      showToast('Tu carrito está vacío');
      return;
    }

    const totalStr = Catalogo.formatPrecio(Cart.getSubtotal() + (Cart.getFreeShippingRemaining() === 0 ? 0 : 3500));

    if (provider === 'mercadopago') {
      alert(`Redirigiendo a Mercado Pago para procesar el pago de ${totalStr}...\n\n¡Gracias por probar CAPFIT!`);
    } else {
      alert(`¡Pedido listo por ${totalStr}!\n\nSe ha generado el resumen de tu compra. ¡Gracias por confiar en CAPFIT!`);
    }

    Cart.clearCart();
    window.navigateToView('inicio');
  };

})();
