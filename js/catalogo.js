// ── CAPFIT Catalogo & Filters Manager ──

const Catalogo = (() => {
  let _gorras = [];
  let _filteredGorras = [];
  let _activeFilters = {
    tipo: 'todas',
    color: 'todos',
    marca: 'todas',
    coleccion: 'todas',
    precioRange: 'todos',
    search: '',
    badge: 'todos'
  };
  let _activeSort = 'mas-vendidos';

  function formatPrecio(n) {
    return '$' + Number(n).toLocaleString('es-AR');
  }

  function renderProductCard(g) {
    const badgeHtml = g.badge
      ? `<span class="badge-pill badge-${g.badge.toLowerCase().replace(/\s+/g, '-')}">${g.badge}</span>`
      : '';

    const priceHtml = g.precioAnterior
      ? `<span class="precio-actual">${formatPrecio(g.precio)}</span> <span class="precio-anterior">${formatPrecio(g.precioAnterior)}</span>`
      : `<span class="precio-actual">${formatPrecio(g.precio)}</span>`;

    const colorsHtml = (g.colores || []).map((c, idx) => {
      const hex = typeof c === 'string' ? c : c.hex;
      const name = typeof c === 'string' ? c : c.name;
      return `<span class="color-dot ${idx === 0 ? 'selected' : ''}" style="background:${hex}" title="${name}"></span>`;
    }).join('');

    const isFav = (localStorage.getItem(`capfit_fav_${g.id}`) === 'true');

    return `
      <div class="product-card fade-in" id="card-${g.id}" data-id="${g.id}">
        <div class="product-card-top">
          <div class="product-badges">${badgeHtml}</div>
          <button class="btn-fav ${isFav ? 'active' : ''}" onclick="Catalogo.toggleFav('${g.id}', event)" title="Favorito">
            <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
            </svg>
          </button>
        </div>

        <div class="product-card-img-wrap" onclick="Catalogo.selectForTryOn('${g.id}')">
          <img src="${g.imgPreview}" alt="${g.nombre}" loading="lazy"
            onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'img-fallback\\'>CAPFIT</div>';">
        </div>

        <div class="product-card-colors">
          ${colorsHtml}
        </div>

        <div class="product-card-info">
          <h3 class="product-title" onclick="Catalogo.selectForTryOn('${g.id}')">${g.nombre}</h3>
          <div class="product-rating">
            <span class="star">★</span>
            <span class="rating-val">${g.rating || 4.9}</span>
            <span class="reviews-cnt">(${g.reviews || 50})</span>
          </div>
          <div class="product-price-row">
            <div class="product-price">${priceHtml}</div>
            ${g.stock ? `<span class="stock-tag">Quedan ${g.stock}</span>` : ''}
          </div>
        </div>

        <div class="product-card-actions">
          <button class="btn-probar-card" onclick="Catalogo.selectForTryOn('${g.id}')">
            PROBAR AHORA
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
          <button class="btn-quick-cart" onclick="Catalogo.quickAddToCart('${g.id}', event)" title="Agregar al carrito">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  function applyFiltersAndSort() {
    let list = [..._gorras];

    // Search query
    if (_activeFilters.search && _activeFilters.search.trim() !== '') {
      const q = _activeFilters.search.toLowerCase().trim();
      list = list.filter(g =>
        g.nombre.toLowerCase().includes(q) ||
        (g.marca && g.marca.toLowerCase().includes(q)) ||
        (g.coleccion && g.coleccion.toLowerCase().includes(q)) ||
        (g.tipo && g.tipo.toLowerCase().includes(q))
      );
    }

    // Filter by Tipo
    if (_activeFilters.tipo !== 'todas') {
      list = list.filter(g => (g.tipo || 'gorra').toLowerCase() === _activeFilters.tipo.toLowerCase());
    }

    // Filter by Badge (e.g. Oferta, Nuevo)
    if (_activeFilters.badge !== 'todos') {
      list = list.filter(g => g.badge && g.badge.toLowerCase().includes(_activeFilters.badge.toLowerCase()));
    }

    // Filter by Marca
    if (_activeFilters.marca !== 'todas') {
      list = list.filter(g => g.marca && g.marca.toLowerCase() === _activeFilters.marca.toLowerCase());
    }

    // Filter by Coleccion
    if (_activeFilters.coleccion !== 'todas') {
      list = list.filter(g => g.coleccion && g.coleccion.toLowerCase() === _activeFilters.coleccion.toLowerCase());
    }

    // Filter by Price range
    if (_activeFilters.precioRange !== 'todos') {
      if (_activeFilters.precioRange === 'hasta-25k') {
        list = list.filter(g => g.precio <= 25000);
      } else if (_activeFilters.precioRange === '25k-30k') {
        list = list.filter(g => g.precio > 25000 && g.precio <= 30000);
      } else if (_activeFilters.precioRange === 'mas-30k') {
        list = list.filter(g => g.precio > 30000);
      }
    }

    // Sorting
    if (_activeSort === 'precio-asc') {
      list.sort((a, b) => a.precio - b.precio);
    } else if (_activeSort === 'precio-desc') {
      list.sort((a, b) => b.precio - a.precio);
    } else if (_activeSort === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else { // mas-vendidos default
      list.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
    }

    _filteredGorras = list;
    renderGrid();
  }

  function renderGrid() {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;

    if (_filteredGorras.length === 0) {
      grid.innerHTML = `
        <div class="empty-catalog-msg">
          <p>No encontramos gorras que coincidan con tu búsqueda.</p>
          <button onclick="Catalogo.resetFilters()" class="btn-reset-filters">Ver todas las gorras</button>
        </div>
      `;
      return;
    }

    grid.innerHTML = _filteredGorras.map(renderProductCard).join('');

    // Re-bind intersection observer for fade-in animations
    if (window.initScrollAnimations) {
      window.initScrollAnimations();
    }
  }

  function populateFilterDropdowns() {
    const marcas = [...new Set(_gorras.map(g => g.marca).filter(Boolean))];
    const colecciones = [...new Set(_gorras.map(g => g.coleccion).filter(Boolean))];

    const marcaSelect = document.getElementById('filter-marca');
    if (marcaSelect) {
      marcaSelect.innerHTML = '<option value="todas">Marca</option>' +
        marcas.map(m => `<option value="${m}">${m}</option>`).join('');
    }

    const colSelect = document.getElementById('filter-coleccion');
    if (colSelect) {
      colSelect.innerHTML = '<option value="todas">Colección</option>' +
        colecciones.map(c => `<option value="${c}">${c}</option>`).join('');
    }
  }

  return {
    formatPrecio,

    async init() {
      try {
        const storeId = (window.Store && Store.getCurrentStoreId) ? Store.getCurrentStoreId() : '';
        const url = storeId && storeId !== 'principal' ? `/api/products?store=${encodeURIComponent(storeId)}` : '/api/products';
        let resp = await fetch(url).catch(() => null);
        if (!resp || !resp.ok) {
          // Reintento en caso de carga inicial
          await new Promise(r => setTimeout(r, 400));
          resp = await fetch(url).catch(() => null);
        }
        if (!resp || !resp.ok) throw new Error(`HTTP ${resp ? resp.status : 'Network error'}`);
        _gorras = await resp.json();
        Store.setGorras(_gorras);

        populateFilterDropdowns();
        applyFiltersAndSort();

        // Default set first product active
        if (_gorras.length > 0 && !Store.getGorraActiva()) {
          Store.setGorraActiva(_gorras[0]);
        }

        // Render recommended carousels
        this.renderRecommendedCarousels();

      } catch (e) {
        console.error('[Catalogo] Error loading products:', e);
      }
    },

    async reload() {
      await this.init();
    },

    setSearch(query) {
      _activeFilters.search = query;
      applyFiltersAndSort();
    },

    setFilter(key, val) {
      _activeFilters[key] = val;
      applyFiltersAndSort();
    },

    setSort(val) {
      _activeSort = val;
      applyFiltersAndSort();
    },

    resetFilters() {
      _activeFilters = {
        tipo: 'todas',
        color: 'todos',
        marca: 'todas',
        coleccion: 'todas',
        precioRange: 'todos',
        search: '',
        badge: 'todos'
      };
      const searchInputs = document.querySelectorAll('#nav-search-input, .search-field');
      searchInputs.forEach(i => i.value = '');
      applyFiltersAndSort();
    },

    toggleFav(id, event) {
      if (event) event.stopPropagation();
      const current = localStorage.getItem(`capfit_fav_${id}`) === 'true';
      localStorage.setItem(`capfit_fav_${id}`, !current);
      applyFiltersAndSort();
    },

    selectForTryOn(id) {
      const g = _gorras.find(item => item.id === id);
      if (!g) return;

      Store.setGorraActiva(g);
      window.gorraActiva = g;

      if (window.updateTryOnSidebarUI) {
        window.updateTryOnSidebarUI(g);
      }

      // Navigate to try-on view
      if (window.navigateToView) {
        window.navigateToView('probador');
      } else {
        window.location.hash = '#probador';
      }
    },

    quickAddToCart(id, event) {
      if (event) event.stopPropagation();
      const g = _gorras.find(item => item.id === id);
      if (!g) return;
      Cart.addToCart(g, 1);
    },

    renderRecommendedCarousels() {
      const recommendContainers = document.querySelectorAll('.recommended-grid');
      if (!recommendContainers.length) return;

      const recommendedItems = _gorras.slice(0, 4);
      const html = recommendedItems.map(g => `
        <div class="recommended-card" onclick="Catalogo.selectForTryOn('${g.id}')">
          <div class="rec-img-wrap">
            <img src="${g.imgPreview}" alt="${g.nombre}">
          </div>
          <div class="rec-info">
            <h4 class="rec-title">${g.nombre}</h4>
            <p class="rec-price">${formatPrecio(g.precio)}</p>
          </div>
          <button class="rec-btn-add" onclick="Catalogo.quickAddToCart('${g.id}', event)" title="Agregar al carrito">
            +
          </button>
        </div>
      `).join('');

      recommendContainers.forEach(c => c.innerHTML = html);
    }
  };
})();

window.Catalogo = Catalogo;
window.addEventListener('DOMContentLoaded', () => Catalogo.init());
