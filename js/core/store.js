/**
 * js/core/store.js
 * Estado reactivo centralizado: gorraActiva, tiendaActual, aiQuota, gorras (<200 líneas).
 */

const Store = (() => {
  let _gorras = [];
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

  function getSubdomainFromHost() {
    try {
      const host = (window.location.hostname || '').toLowerCase();
      if (host === 'capfit.store' || host === 'www.capfit.store') return 'principal';
      if (host.includes('run.app') || host.includes('localhost') || host.includes('127.0.0.1') ||
          host.startsWith('ais-') || host.includes('aistudio') || host.includes('web.app') || host.includes('firebaseapp.com')) {
        return '';
      }
      const parts = host.split('.');
      if (parts.length >= 2) {
        const sub = parts[0];
        if (sub === 'www' || sub === 'capfit' || sub === 'shop' || sub === 'shpo') return 'principal';
        if (sub && sub !== 'api' && sub !== 'admin' && !sub.startsWith('ais-')) return sub;
      }
    } catch (e) {}
    return '';
  }

  function getQueryStoreId() {
    try {
      const p = new URLSearchParams(window.location.search);
      const s = p.get('store') || p.get('tienda');
      if (s) {
        const clean = s.trim().toLowerCase();
        if (clean === 'www' || clean === 'capfit' || clean === 'principal' || clean === 'shop' || clean === 'shpo') return 'principal';
        if (!clean.startsWith('ais-')) return clean;
      }
      const hostSub = getSubdomainFromHost();
      if (hostSub) return hostSub;
      const saved = localStorage.getItem('capfit_active_store_id');
      if (saved && !saved.startsWith('ais-') && !saved.includes('run.app')) return saved;
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
      console.warn('[Store] sync error:', e);
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
    emit,
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
    setGorras(list) {
      _gorras = list;
      emit('gorras:loaded', list);
    },
    getGorras() { return _gorras; },
    setGorraActiva(g) {
      _gorraActiva = g;
      emit('gorraActiva:changed', g);
    },
    getGorraActiva() { return _gorraActiva; },
    hasGorraActiva() { return _gorraActiva !== null; }
  };
})();

window.gorraActiva = null;
Store.on('gorraActiva:changed', (g) => { window.gorraActiva = g; });
window.Store = Store;
