/**
 * js/core/router.js
 * Enrutador SPA ligero basado en hash y nombres de vistas (<150 líneas).
 */

(function() {
  'use strict';

  function normalizeViewName(viewName) {
    let clean = (viewName || '').trim().replace(/^#\/?|^[/\\]+/, '');
    if (!clean) clean = 'inicio';
    if (clean === 'account' || clean === 'portal-duenos') clean = 'admin';
    if (clean === 'app') clean = 'probador';
    if (clean === 'shop' || clean === 'shpo' || clean === 'catalog') clean = 'inicio';
    if (clean === 'blog') clean = 'sobre-nosotros';
    if (clean === 'preguntas-frecuentes') clean = 'faq';
    if (clean === 'envios-y-entregas') clean = 'envios';
    if (clean === 'cambios-y-devoluciones') clean = 'cambios';
    if (clean === 'terminos-y-condiciones') clean = 'terminos';
    if (clean === 'politica-de-privacidad') clean = 'privacidad';
    return clean;
  }

  function navigateToView(viewName) {
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => v.classList.remove('active-view'));

    let cleanName = normalizeViewName(viewName);
    let target = document.getElementById(`view-${cleanName}`);

    if (!target) {
      target = document.getElementById('view-404') || document.getElementById('view-inicio');
      cleanName = target && target.id === 'view-404' ? '404' : 'inicio';
    }

    if (target) {
      target.classList.add('active-view');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Actualizar nav links activos
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.remove('active');
      const href = a.getAttribute('href') || '';
      if (href === `#${cleanName}` || href === `/${cleanName}` || (cleanName === 'admin' && (href === '#account' || href === '/account'))) {
        a.classList.add('active');
      }
    });

    // Despachar eventos e inicializaciones específicas
    if (cleanName === 'carrito' && typeof window.renderCartView === 'function') {
      window.renderCartView();
    } else if (cleanName === 'probador' && typeof window.updateTryOnViewUI === 'function') {
      window.updateTryOnViewUI();
    } else if (cleanName === 'admin' && window.AdminPanel && typeof window.AdminPanel.init === 'function') {
      window.AdminPanel.init();
    } else if (cleanName === 'sobre-nosotros' && window.SobreNosotros && typeof window.SobreNosotros.render === 'function') {
      window.SobreNosotros.render();
    }

    // Actualizar hash si difiere
    if (window.location.hash !== `#${cleanName}` && cleanName !== 'inicio') {
      history.replaceState(null, '', `#${cleanName}`);
    } else if (cleanName === 'inicio' && window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function initRouter() {
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.slice(1);
      if (hash) navigateToView(hash);
      else navigateToView('inicio');
    });

    // Detectar vista inicial
    const initialHash = window.location.hash.slice(1);
    if (initialHash) {
      navigateToView(initialHash);
    }
  }

  window.navigateToView = navigateToView;
  window.Router = { navigateToView, init: initRouter };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter);
  } else {
    initRouter();
  }
})();
