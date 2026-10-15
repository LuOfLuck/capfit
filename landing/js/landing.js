// Script de narrativa de scroll cinematográfica e interacciones para la Landing Comercial de CapFit (capfit.store)
(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLowPowerDevice = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
    window.innerWidth <= 768;

  function initHeroAndSectionReveals() {
    if (prefersReducedMotion) return;

    const root = document.documentElement;
    root.classList.add('js-anim-ready');
    root.style.setProperty('--closing-darkness', '0');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.add('hero-loaded');
      });
    });

    if (!('IntersectionObserver' in window)) {
      root.style.setProperty('--closing-darkness', '1');
      document.querySelectorAll('.reveal-section, .closing-atmosphere-shell').forEach((sec) => {
        sec.classList.add('is-visible');
      });
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      {
        root: null,
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.12
      }
    );

    document.querySelectorAll('.reveal-section, .closing-atmosphere-shell').forEach((sec) => {
      revealObserver.observe(sec);
    });
  }

  function initActiveNavObserver() {
    if (!('IntersectionObserver' in window)) return;

    const navLinks = Array.from(document.querySelectorAll('.landing-nav-links .nav-link'));
    if (!navLinks.length) return;

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.getAttribute('id');
          navLinks.forEach((link) => {
            const matches = link.getAttribute('href') === '#' + id;
            link.classList.toggle('is-active', matches);
          });
        });
      },
      {
        rootMargin: '-30% 0px -55% 0px',
        threshold: 0
      }
    );

    document.querySelectorAll('.narrative-section[id]').forEach((sec) => {
      sectionObserver.observe(sec);
    });
  }

  function setTryOnStage(stepNumber) {
    const num = Number(stepNumber) || 1;
    const stepStr = String(num);
    const choreography = document.getElementById('tryon-choreography');
    if (choreography) {
      choreography.setAttribute('data-active-step', stepStr);
    }

    document.querySelectorAll('.tryon-step-tab').forEach((btn) => {
      const isMatch = btn.getAttribute('data-tryon-step') === stepStr;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    document.querySelectorAll('.tryon-flow-card').forEach((panel) => {
      const isMatch = panel.getAttribute('data-panel-step') === stepStr;
      panel.classList.toggle('is-focused', isMatch);
    });

    // Coordinar visualmente las flechas entre etapas (1->2 y 2->3)
    document.querySelectorAll('.flow-arrow-connector').forEach((arrow) => {
      const arrowIdx = Number(arrow.getAttribute('data-arrow-step') || 0);
      arrow.classList.toggle('is-passed', num > arrowIdx);
    });
  }

  function initTryOnControls() {
    let userManuallySelectedStep = false;

    document.querySelectorAll('.tryon-step-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        userManuallySelectedStep = true;
        const step = tab.getAttribute('data-tryon-step');
        if (step) setTryOnStage(step);
      });
    });

    // Permitir también clic directo sobre cualquiera de las 3 tarjetas para enfocar esa etapa
    document.querySelectorAll('.tryon-flow-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        const step = card.getAttribute('data-panel-step');
        if (step) {
          userManuallySelectedStep = true;
          setTryOnStage(step);
        }
      });
    });

    const productImg = document.getElementById('tryon-demo-product-img');
    const productName = document.getElementById('tryon-demo-product-name');
    const productType = document.getElementById('tryon-demo-product-type');
    const productPrice = document.getElementById('tryon-demo-product-price');
    const resultMiniImg = document.getElementById('tryon-result-mini-img');

    document.querySelectorAll('.side-thumb-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.side-thumb-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const imgSrc = btn.getAttribute('data-img');
        const nameTxt = btn.getAttribute('data-name');
        const subTxt = btn.getAttribute('data-sub');
        const priceTxt = btn.getAttribute('data-price');

        if (productImg && imgSrc) productImg.src = imgSrc;
        if (productName && nameTxt) productName.textContent = nameTxt;
        if (productType && subTxt) productType.textContent = subTxt;
        if (productPrice && priceTxt) productPrice.textContent = priceTxt;
        if (resultMiniImg && imgSrc) {
          resultMiniImg.src = imgSrc;
          const parentBtn = resultMiniImg.closest('.result-thumb-btn');
          if (parentBtn) parentBtn.setAttribute('data-result-img', imgSrc);
        }
      });
    });

    document.querySelectorAll('.swatch-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.swatch-dot').forEach((d) => d.classList.remove('active'));
        dot.classList.add('active');
        const imgSrc = dot.getAttribute('data-img');
        if (productImg && imgSrc) productImg.src = imgSrc;
      });
    });

    const resultPortrait = document.getElementById('tryon-result-portrait-img');
    document.querySelectorAll('.result-thumb-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.result-thumb-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const src = btn.getAttribute('data-result-img');
        if (resultPortrait && src) {
          resultPortrait.src = src;
        }
      });
    });

    return {
      isManual: () => userManuallySelectedStep
    };
  }

  function initCatalogStorefront() {
    const grid = document.getElementById('landing-catalog-grid');
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.catalog-item-card'));
    const topFilterBtns = Array.from(document.querySelectorAll('.filter-tab-btn'));
    const sidebarCatBtns = Array.from(document.querySelectorAll('.sidebar-cat-btn'));
    const searchInput = document.getElementById('landing-catalog-search');
    const sortSelect = document.getElementById('landing-catalog-sort');
    const priceRange = document.getElementById('landing-price-range');
    const priceDisplay = document.getElementById('price-filter-display');
    const brandChecks = Array.from(document.querySelectorAll('input[name="brand"]'));
    const clearTop = document.getElementById('btn-clear-filters-top');
    const clearBottom = document.getElementById('btn-clear-filters-bottom');

    let activeCategory = 'todos';

    function formatArs(num) {
      return '$' + Number(num).toLocaleString('es-AR');
    }

    function applyFilters() {
      const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const maxPrice = priceRange ? Number(priceRange.value) : 60000;
      const selectedBrands = brandChecks.filter((c) => c.checked).map((c) => c.value);

      cards.forEach((card) => {
        const cat = card.getAttribute('data-category') || '';
        const brand = card.getAttribute('data-brand') || '';
        const price = Number(card.getAttribute('data-price') || 0);
        const title = (card.querySelector('.item-title')?.textContent || '').toLowerCase();

        const matchCat = activeCategory === 'todos' || cat === activeCategory;
        const matchQuery = !query || title.includes(query) || cat.includes(query) || brand.toLowerCase().includes(query);
        const matchPrice = price <= maxPrice;
        const matchBrand = selectedBrands.length === 0 || selectedBrands.includes(brand);

        card.classList.toggle('is-hidden', !(matchCat && matchQuery && matchPrice && matchBrand));
      });

      if (sortSelect) {
        const sortBy = sortSelect.value;
        const sorted = [...cards].sort((a, b) => {
          const priceA = Number(a.getAttribute('data-price') || 0);
          const priceB = Number(b.getAttribute('data-price') || 0);
          const orderA = Number(a.getAttribute('data-order') || 0);
          const orderB = Number(b.getAttribute('data-order') || 0);
          if (sortBy === 'menor-precio') return priceA - priceB;
          if (sortBy === 'mayor-precio') return priceB - priceA;
          return orderA - orderB;
        });
        sorted.forEach((el) => grid.appendChild(el));
      }
    }

    topFilterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-filter') || 'todos';
        topFilterBtns.forEach((b) => b.classList.toggle('active', b === btn));
        applyFilters();
      });
    });

    sidebarCatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.getAttribute('data-filter') || 'todos';
        topFilterBtns.forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-filter') === activeCategory);
        });
        applyFilters();
      });
    });

    if (searchInput) searchInput.addEventListener('input', applyFilters);
    if (sortSelect) sortSelect.addEventListener('change', applyFilters);

    if (priceRange) {
      priceRange.addEventListener('input', () => {
        if (priceDisplay) priceDisplay.textContent = formatArs(priceRange.value);
        applyFilters();
      });
    }

    brandChecks.forEach((chk) => chk.addEventListener('change', applyFilters));

    document.querySelectorAll('.sidebar-color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-color-swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
      });
    });

    document.querySelectorAll('.card-fav-btn').forEach((fav) => {
      fav.addEventListener('click', () => {
        const liked = fav.textContent === '♥';
        fav.textContent = liked ? '♡' : '♥';
        fav.style.color = liked ? '' : '#e85d24';
      });
    });

    function resetAllFilters() {
      activeCategory = 'todos';
      topFilterBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-filter') === 'todos'));
      if (searchInput) searchInput.value = '';
      if (sortSelect) sortSelect.value = 'recientes';
      if (priceRange) {
        priceRange.value = '60000';
        if (priceDisplay) priceDisplay.textContent = '$60.000';
      }
      brandChecks.forEach((c) => { c.checked = false; });
      applyFilters();
    }

    if (clearTop) clearTop.addEventListener('click', resetAllFilters);
    if (clearBottom) clearBottom.addEventListener('click', resetAllFilters);
  }

  function initAdminCapabilityTabs() {
    const capButtons = document.querySelectorAll('.capability-item[data-admin-view]');
    const boNavItems = document.querySelectorAll('.bo-nav-item[data-bo-tab]');
    const panels = document.querySelectorAll('.admin-shell-body[data-admin-panel]');
    if (!capButtons.length || !panels.length) return;

    function activateAdminView(targetView) {
      capButtons.forEach((b) => {
        const active = b.getAttribute('data-admin-view') === targetView;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      boNavItems.forEach((item) => {
        const active = item.getAttribute('data-bo-tab') === targetView;
        item.classList.toggle('active', active);
      });

      panels.forEach((panel) => {
        const isTarget = panel.getAttribute('data-admin-panel') === targetView;
        panel.classList.toggle('active', isTarget);
      });
    }

    capButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-admin-view');
        if (targetView) activateAdminView(targetView);
      });
    });

    boNavItems.forEach((item) => {
      item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-bo-tab');
        if (targetView) activateAdminView(targetView);
      });
    });
  }

  function initProgressiveScrollChoreography(tryOnState) {
    if (prefersReducedMotion) return;

    const progressBar = document.getElementById('scroll-progress-bar');
    const tryOnSection = document.getElementById('recorrido-probador');
    const closingShell = document.getElementById('closing-atmosphere');
    const rootStyle = document.documentElement.style;
    let ticking = false;

    function updateOnScroll() {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const vh = window.innerHeight || 800;
      const docHeight = Math.max(1, document.documentElement.scrollHeight - vh);
      const totalProgress = Math.min(1, Math.max(0.08, scrollY / docHeight));

      if (progressBar) {
        progressBar.style.transform = `scaleX(${totalProgress.toFixed(3)})`;
      }

      if (!isLowPowerDevice) {
        // 1. Transición de escala muy leve en la imagen principal del Hero
        const heroScale = 1 + Math.min(1, scrollY / 520) * 0.032;
        rootStyle.setProperty('--hero-img-scale', heroScale.toFixed(4));

        // 2. Coordinación de escena Catálogo (01) -> Probador (02) -> Resultado (03)
        if (tryOnSection && (!tryOnState || !tryOnState.isManual())) {
          const rect = tryOnSection.getBoundingClientRect();
          if (rect.top < vh * 0.8 && rect.bottom > vh * 0.2) {
            const sectionSpan = Math.max(1, rect.height);
            const passed = vh * 0.58 - rect.top;
            const ratio = Math.min(1, Math.max(0, passed / sectionSpan));
            if (ratio < 0.34) {
              setTryOnStage(1);
            } else if (ratio < 0.68) {
              setTryOnStage(2);
            } else {
              setTryOnStage(3);
            }
          }
        }
      }

      // 6. Transición suave del fondo marfil al negro al entrar al Cierre
      if (closingShell) {
        const closeRect = closingShell.getBoundingClientRect();
        const enterRatio = Math.min(1, Math.max(0, (vh - closeRect.top) / (vh * 0.62)));
        rootStyle.setProperty('--closing-darkness', enterRatio.toFixed(3));
      }

      ticking = false;
    }

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(updateOnScroll);
          ticking = true;
        }
      },
      { passive: true }
    );

    updateOnScroll();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHeroAndSectionReveals();
    initActiveNavObserver();
    const tryOnState = initTryOnControls();
    initCatalogStorefront();
    initAdminCapabilityTabs();
    initProgressiveScrollChoreography(tryOnState);
  });
})();
