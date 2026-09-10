
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

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateHeaderLogo(store) {
    const logoLink = document.getElementById('main-nav-logo') || document.querySelector('.nav-logo');
    if (!logoLink) return;

    const isCapfit = !store ||
      store.id === 'principal' ||
      store.subdomain === 'capfit' ||
      store.subdomain === 'www' ||
      (store.name && (store.name.trim().toLowerCase() === 'capfit' || store.name.trim().toLowerCase() === 'capfit oficial'));

    if (isCapfit) {
      // Si la tienda es capfit, dejarlo como está
      logoLink.innerHTML = `CAP<span>FIT</span>`;
      logoLink.style.color = '';
    } else {
      // Si la tienda no es capfit, mostrar el nombre de la tienda en color negro
      const storeName = store.name || store.subdomain || 'Tienda';
      logoLink.innerHTML = `<span class="store-custom-header-name" style="color: #000000; font-weight: 800; font-size: 1.25rem; letter-spacing: -0.5px; text-transform: uppercase;">${escapeHtml(storeName)}</span>`;
      logoLink.style.color = '#000000';
    }
  }

  function getSubdomainFromHost() {
    try {
      const host = (window.location.hostname || '').toLowerCase();
      // Si el dominio es directamente capfit.store o www.capfit.store -> siempre es la tienda principal
      if (host === 'capfit.store' || host === 'www.capfit.store') {
        return 'principal';
      }
      // Ignorar completamente dominios de Google Cloud Run, AI Studio, localhost y dominios de despliegue
      if (
        host.includes('run.app') ||
        host.includes('localhost') ||
        host.includes('127.0.0.1') ||
        host.startsWith('ais-') ||
        host.includes('aistudio') ||
        host.includes('web.app') ||
        host.includes('firebaseapp.com')
      ) {
        return '';
      }
      const parts = host.split('.');
      if (parts.length >= 2) {
        const sub = parts[0];
        if (sub === 'www' || sub === 'capfit' || sub === 'shop' || sub === 'shpo') {
          return 'principal';
        }
        if (sub && sub !== 'api' && sub !== 'admin' && !sub.startsWith('ais-')) {
          return sub;
        }
      }
    } catch (e) {}
    return '';
  }

  function getQueryStoreId() {
    try {
      // 1. Parámetro explícito de query string (?store= o ?tienda=) - TIENE PRIORIDAD MÁXIMA
      const p = new URLSearchParams(window.location.search);
      const s = p.get('store') || p.get('tienda');
      if (s) {
        const clean = s.trim().toLowerCase();
        if (clean === 'www' || clean === 'capfit' || clean === 'principal' || clean === 'shop' || clean === 'shpo') {
          return 'principal';
        }
        if (!clean.startsWith('ais-')) return clean;
      }

      // 2. Subdominio de host de producción (ej: prendakxp.capfit.store)
      const hostSub = getSubdomainFromHost();
      if (hostSub) return hostSub;

      // 3. Tienda guardada en sesión local (si no es un ID de despliegue temporal)
      const saved = localStorage.getItem('capfit_active_store_id');
      if (saved && !saved.startsWith('ais-') && !saved.includes('run.app')) {
        return saved;
      }
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
    if (!storeId || storeId === 'principal') {
      localStorage.removeItem('capfit_active_store_id');
      const host = (window.location.hostname || '').toLowerCase();
      if (host.includes('capfit.store') && host !== 'capfit.store') {
        window.location.href = `https://capfit.store/`;
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('store');
      url.searchParams.delete('tienda');
      window.location.href = url.pathname + (url.search ? url.search : '') + window.location.hash;
    } else {
      localStorage.setItem('capfit_active_store_id', storeId);
      const host = (window.location.hostname || '').toLowerCase();
      if (host.endsWith('capfit.store')) {
        // Redirigir directamente al subdominio si estamos en capfit.store
        window.location.href = `https://${storeId}.capfit.store/`;
        return;
      }
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
      if (_currentStore && _currentStore.id && !_currentStore.id.startsWith('ais-')) {
        return _currentStore.id;
      }
      const q = getQueryStoreId();
      return (q && !q.startsWith('ais-')) ? q : 'principal';
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
    updateHeaderLogo,
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
            <div class="store-item-subdomain">${s.subdomain}.capfit.store</div>
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
    lbl.textContent = `${data.store.subdomain}.capfit.store`;
  }
  if (Store.updateHeaderLogo) {
    Store.updateHeaderLogo(data ? data.store : null);
  }
});

window.updateHeaderLogo = function(store) {
  if (window.Store && Store.updateHeaderLogo) {
    Store.updateHeaderLogo(store);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (Store.updateHeaderLogo) {
    Store.updateHeaderLogo(Store.getCurrentStore());
  }
});

Store.syncCurrentStore();