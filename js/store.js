
const Store = (() => {
  let _gorras      = [];
  let _gorraActiva = null;
  let _currentStore = null;
  let _aiQuota = null;
  const _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }

  function emit(event, payload) {
    (_listeners[event] || []).forEach(fn => {
      try { fn(payload); } catch(e) { console.error('[Store event error]', e); }
    });
  }

  function getQueryStoreId() {
    try {
      const p = new URLSearchParams(window.location.search);
      const s = p.get('store');
      if (s) return s;
      const saved = localStorage.getItem('capfit_active_store_id');
      if (saved) return saved;
    } catch (e) {}
    return '';
  }

  async function syncCurrentStore() {
    try {
      const qStore = getQueryStoreId();
      const url = qStore ? `/api/store/current?store=${encodeURIComponent(qStore)}` : '/api/store/current';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          _currentStore = data.store;
          _aiQuota = data.aiQuota;
          emit('store:synced', { store: _currentStore, quota: _aiQuota });
          return { store: _currentStore, quota: _aiQuota };
        }
      }
    } catch (e) {
      console.warn('[Store] Could not fetch current store:', e);
    }
    return null;
  }

  function switchStore(storeId) {
    if (!storeId) {
      localStorage.removeItem('capfit_active_store_id');
      const url = new URL(window.location.href);
      url.searchParams.delete('store');
      window.location.href = url.pathname + (url.search ? url.search : '') + window.location.hash;
    } else {
      localStorage.setItem('capfit_active_store_id', storeId);
      const url = new URL(window.location.href);
      url.searchParams.set('store', storeId);
      window.location.href = url.pathname + url.search + window.location.hash;
    }
  }

  return {
    on,
    syncCurrentStore,
    switchStore,
    getCurrentStore() { return _currentStore; },
    getAiQuota() { return _aiQuota; },
    getCurrentStoreId() {
      if (_currentStore && _currentStore.id) return _currentStore.id;
      return getQueryStoreId() || 'principal';
    },

    // ── Gorras ──
    setGorras(list) {
      _gorras = list;
      emit('gorras:loaded', list);
    },
    getGorras() { return _gorras; },

    // ── Gorra activa ──
    setGorraActiva(g) {
      _gorraActiva = g;
      emit('gorraActiva:changed', g);
    },
    getGorraActiva() { return _gorraActiva; },
    hasGorraActiva() { return _gorraActiva !== null; },
  };
})();

/* ══ Compatibilidad global ══ */
window.gorraActiva = null;
Store.on('gorraActiva:changed', (g) => { window.gorraActiva = g; });
window.Store = Store;

// ── Dropdown & UI para subdominios en navbar ──
window.toggleStoreDropdown = function(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('nav-store-dropdown');
  if (!dropdown) return;
  const isShown = dropdown.style.display === 'block';
  dropdown.style.display = isShown ? 'none' : 'block';
  if (!isShown) {
    loadPublicStoresIntoDropdown();
  }
};

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('nav-store-dropdown');
  if (dropdown && dropdown.style.display === 'block') {
    if (!e.target.closest('#nav-store-pill')) {
      dropdown.style.display = 'none';
    }
  }
});

async function loadPublicStoresIntoDropdown() {
  const listEl = document.getElementById('nav-store-dropdown-list');
  if (!listEl) return;
  try {
    const res = await fetch('/api/stores');
    if (!res.ok) return;
    const stores = await res.json();
    const currentId = Store.getCurrentStoreId();

    listEl.innerHTML = stores.map(s => {
      const isCur = s.id === currentId;
      return `
        <div class="store-dropdown-item ${isCur ? 'active' : ''}" onclick="Store.switchStore('${s.id}')">
          <div>
            <div class="store-item-name">${s.name} ${isCur ? '✓' : ''}</div>
            <div class="store-item-subdomain">${s.subdomain}.capfit.shop</div>
          </div>
          <span class="store-item-badge">${s.plan || 'Plan'}</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.warn('[Stores] error listing:', e);
  }
}

Store.on('store:synced', (data) => {
  const lbl = document.getElementById('nav-store-subdomain-label');
  if (lbl && data && data.store) {
    lbl.textContent = `${data.store.subdomain}.capfit.shop`;
  }
});

Store.syncCurrentStore();