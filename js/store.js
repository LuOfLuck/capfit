
const Store = (() => {
  let _gorras      = [];
  let _gorraActiva = null;
  const _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }

  function emit(event, payload) {
    (_listeners[event] || []).forEach(fn => fn(payload));
  }

  return {
    on,

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