/**
 * js/features/catalog/catalog.js
 * Catálogo interactivo de gorras, filtros por categoría/estilo y ordenamiento (<250 líneas).
 */

const Catalogo = (() => {
  let _gorras = [];
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

  function renderProductCard(g) {
    const badgeHtml = g.badge
      ? `<span class="badge-pill badge-${g.badge.toLowerCase().replace(/\s+/g, '-')}">${g.badge}</span>`
      : '';

    const priceHtml = g.precioAnterior
      ? `<span class="precio-actual">${window.formatPrecio(g.precio)}</span> <span class="precio-anterior">${window.formatPrecio(g.precioAnterior)}</span>`
      : `<span class="precio-actual">${window.formatPrecio(g.precio)}</span>`;

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
        <div class="product-card-colors">${colorsHtml}</div>
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

    if (_activeFilters.search && _activeFilters.search.trim() !== '') {
      const q = _activeFilters.search.toLowerCase().trim();
      list = list.filter(g =>
        g.nombre.toLowerCase().includes(q) ||
        (g.marca && g.marca.toLowerCase().includes(q)) ||
        (g.coleccion && g.coleccion.toLowerCase().includes(q)) ||
        (g.tipo && g.tipo.toLowerCase().includes(q))
      );
    }

    if (_activeFilters.tipo !== 'todas') {
      list = list.filter(g => (g.tipo || 'gorra') === _activeFilters.tipo);
    }

    if (_activeFilters.color !== 'todos') {
      list = list.filter(g => (g.colores || []).some(c => (c.name || '').toLowerCase() === _activeFilters.color.toLowerCase()));
    }

    if (_activeFilters.precioRange !== 'todos') {
      if (_activeFilters.precioRange === 'sub-30k') list = list.filter(g => g.precio < 30000);
      else if (_activeFilters.precioRange === '30k-40k') list = list.filter(g => g.precio >= 30000 && g.precio <= 40000);
      else if (_activeFilters.precioRange === 'over-40k') list = list.filter(g => g.precio > 40000);
    }

    if (_activeSort === 'precio-menor') list.sort((a, b) => a.precio - b.precio);
    else if (_activeSort === 'precio-mayor') list.sort((a, b) => b.precio - a.precio);
    else list.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));

    const grid = document.getElementById('catalog-grid');
    const emptyState = document.getElementById('catalog-empty-state');
    const countEl = document.getElementById('catalog-count');

    if (countEl) countEl.textContent = `${list.length} productos`;

    if (grid) {
      if (list.length === 0) {
        grid.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
      } else {
        if (emptyState) emptyState.style.display = 'none';
        grid.innerHTML = list.map(renderProductCard).join('');
      }
    }
  }

  function init() {
    Store.on('gorras:loaded', (items) => {
      _gorras = items || [];
      applyFiltersAndSort();
    });
    if (Store.getGorras().length) {
      _gorras = Store.getGorras();
      applyFiltersAndSort();
    }
  }

  return {
    init,
    applyFiltersAndSort,
    setFilter(key, val) { _activeFilters[key] = val; applyFiltersAndSort(); },
    setSort(val) { _activeSort = val; applyFiltersAndSort(); },
    resetFilters() {
      _activeFilters = { tipo: 'todas', color: 'todos', marca: 'todas', coleccion: 'todas', precioRange: 'todos', search: '', badge: 'todos' };
      applyFiltersAndSort();
    },
    toggleFav(id, event) {
      if (event) event.stopPropagation();
      const cur = localStorage.getItem(`capfit_fav_${id}`) === 'true';
      localStorage.setItem(`capfit_fav_${id}`, !cur);
      applyFiltersAndSort();
    },
    selectForTryOn(id) {
      const g = _gorras.find(i => i.id === id);
      if (!g) return;
      Store.setGorraActiva(g);
      if (window.updateTryOnSidebarUI) window.updateTryOnSidebarUI(g);
      if (window.navigateToView) window.navigateToView('probador');
      else window.location.hash = '#probador';
    },
    quickAddToCart(id, event) {
      if (event) event.stopPropagation();
      const g = _gorras.find(i => i.id === id);
      if (g) Cart.addToCart(g, 1);
    }
  };
})();

window.Catalogo = Catalogo;
window.addEventListener('DOMContentLoaded', () => Catalogo.init());
