(function () {
      'use strict';

      let toastTimer = null;
      function showToast(message) {
        const toast = document.getElementById('capfit-toast');
        const text = document.getElementById('capfit-toast-text');
        if (!toast || !text) return;
        text.textContent = message;
        toast.classList.add('is-shown');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toast.classList.remove('is-shown');
        }, 2800);
      }

      /* ── 1. SMOOTH SCROLL (LENIS) + GSAP SCROLLTRIGGER ── */
      function initLenisAndGSAP() {
        const hasGSAP = typeof window.gsap !== 'undefined';
        const hasScrollTrigger = typeof window.ScrollTrigger !== 'undefined';
        const hasLenis = typeof window.Lenis !== 'undefined';

        if (hasGSAP && hasScrollTrigger) {
          gsap.registerPlugin(ScrollTrigger);
        }

        if (hasLenis) {
          const lenis = new Lenis({
            duration: 1.15,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true
          });

          if (hasGSAP && hasScrollTrigger) {
            lenis.on('scroll', ScrollTrigger.update);
            gsap.ticker.add((time) => {
              lenis.raf(time * 1000);
            });
            gsap.ticker.lagSmoothing(0);
          } else {
            function raf(time) {
              lenis.raf(time);
              requestAnimationFrame(raf);
            }
            requestAnimationFrame(raf);
          }
        }
      }

      /* ── 2. INTRO CINÉTICA (LOADER 0-100% + REVELADO PALABRA POR PALABRA) ── */
      function initKineticIntro() {
        const loader = document.getElementById('kinetic-loader');
        const barFill = document.getElementById('loader-bar-fill');
        const counter = document.getElementById('loader-counter');

        if (!loader || typeof window.gsap === 'undefined') {
          if (loader) loader.style.display = 'none';
          return;
        }

        const state = { val: 0 };
        const tl = gsap.timeline();

        tl.to(state, {
          val: 100,
          duration: 1.05,
          ease: 'power2.inOut',
          onUpdate: () => {
            const v = Math.round(state.val);
            if (counter) counter.textContent = (v < 10 ? '0' : '') + v + '%';
            if (barFill) barFill.style.width = v + '%';
          }
        })
        .to(loader, {
          yPercent: -100,
          duration: 0.85,
          ease: 'expo.inOut',
          onComplete: () => {
            loader.style.display = 'none';
          }
        })
        .from('.word-inner', {
          yPercent: 115,
          stagger: 0.045,
          duration: 0.85,
          ease: 'power4.out'
        }, '-=0.45')
        .from('.hero-anim-el', {
          y: 22,
          opacity: 0,
          stagger: 0.08,
          duration: 0.7,
          ease: 'power3.out'
        }, '-=0.6')
        .from('#hero-3d-stage', {
          scale: 0.92,
          opacity: 0,
          rotateX: 8,
          duration: 1,
          ease: 'expo.out'
        }, '-=0.75');
      }

      /* ── 3. CURSOR MAGNÉTICO INTERACTIVO + BOTONES MAGNÉTICOS ── */
      function initMagneticCursor() {
        const ring = document.getElementById('cursor-ring');
        const dot = document.getElementById('cursor-dot');
        const label = document.getElementById('cursor-label');
        if (!ring || !dot || window.innerWidth <= 960) return;

        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let ringX = mouseX;
        let ringY = mouseY;

        window.addEventListener('mousemove', (e) => {
          mouseX = e.clientX;
          mouseY = e.clientY;
          dot.style.left = mouseX + 'px';
          dot.style.top = mouseY + 'px';
        }, { passive: true });

        function renderCursor() {
          ringX += (mouseX - ringX) * 0.18;
          ringY += (mouseY - ringY) * 0.18;
          ring.style.left = ringX + 'px';
          ring.style.top = ringY + 'px';
          requestAnimationFrame(renderCursor);
        }
        requestAnimationFrame(renderCursor);

        document.querySelectorAll('[data-cursor]').forEach((el) => {
          el.addEventListener('mouseenter', () => {
            const text = el.getAttribute('data-cursor') || 'VER';
            if (label) label.textContent = text;
            ring.classList.add('is-expanded');
          });
          el.addEventListener('mouseleave', () => {
            ring.classList.remove('is-expanded');
          });
        });

        // Efecto imán en botones con atributo [data-magnetic]
        document.querySelectorAll('[data-magnetic]').forEach((btn) => {
          btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const relX = e.clientX - rect.left - rect.width / 2;
            const relY = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate3d(${relX * 0.22}px, ${relY * 0.28}px, 0)`;
          });
          btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate3d(0, 0, 0)';
          });
        });
      }

      /* ── 4. HERO 3D TILT + TELEMETRÍA PARALLAX ── */
      function initHero3DTilt() {
        const area = document.getElementById('hero-tilt-area');
        const stage = document.getElementById('hero-3d-stage');
        const chip1 = document.getElementById('hero-chip-1');
        const chip2 = document.getElementById('hero-chip-2');
        const img = document.getElementById('hero-masked-img');

        if (!area || !stage || typeof window.gsap === 'undefined') return;

        area.addEventListener('mousemove', (e) => {
          const rect = area.getBoundingClientRect();
          const nx = (e.clientX - rect.left) / rect.width - 0.5;
          const ny = (e.clientY - rect.top) / rect.height - 0.5;

          gsap.to(stage, {
            rotateY: nx * 12,
            rotateX: -ny * 12,
            duration: 0.45,
            ease: 'power2.out'
          });

          if (img) {
            gsap.to(img, {
              x: -nx * 18,
              y: -ny * 18,
              duration: 0.45,
              ease: 'power2.out'
            });
          }

          if (chip1 && chip2) {
            gsap.to(chip1, { x: nx * 26, y: ny * 26, duration: 0.45 });
            gsap.to(chip2, { x: -nx * 28, y: -ny * 22, duration: 0.45 });
          }
        });

        area.addEventListener('mouseleave', () => {
          gsap.to(stage, { rotateY: 0, rotateX: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
          if (img) gsap.to(img, { x: 0, y: 0, duration: 0.7 });
          if (chip1 && chip2) {
            gsap.to([chip1, chip2], { x: 0, y: 0, duration: 0.7 });
          }
        });
      }

      /* ── 5. COREOGRAFÍA GSAP SCROLLTRIGGER EN TODAS LAS SECCIONES ── */
      function initScrollAnimations(tryOnState) {
        if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') return;

        // Revelado suave de cabeceras y bloques
        gsap.utils.toArray('.gsap-reveal-up').forEach((el) => {
          gsap.from(el, {
            y: 42,
            opacity: 0,
            duration: 0.85,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 86%'
            }
          });
        });

        // Entrada escalonada de las 3 tarjetas del Probador Virtual
        gsap.from('.gsap-tryon-card', {
          y: 55,
          opacity: 0,
          stagger: 0.15,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '#tryon-choreography',
            start: 'top 82%'
          }
        });

        // Avance automático de Etapa 01 -> 02 -> 03 al scrollear por la sección 02
        ScrollTrigger.create({
          trigger: '#recorrido-probador',
          start: 'top 55%',
          end: 'bottom 45%',
          onUpdate: (self) => {
            if (tryOnState && tryOnState.isManual()) return;
            const p = self.progress;
            if (p < 0.33) setTryOnStage(1);
            else if (p < 0.66) setTryOnStage(2);
            else setTryOnStage(3);
          }
        });

        // Entrada escalonada de las tarjetas del Catálogo
        gsap.from('.gsap-catalog-card', {
          y: 40,
          opacity: 0,
          stagger: 0.08,
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '#landing-catalog-grid',
            start: 'top 85%'
          }
        });

        // Perspectiva 3D en la ventana del Backoffice al entrar en viewport
        const boWin = document.getElementById('backoffice-3d-window');
        if (boWin) {
          gsap.fromTo(boWin,
            { rotateX: 14, rotateY: -10, y: 45, opacity: 0.2 },
            {
              rotateX: 0,
              rotateY: 0,
              y: 0,
              opacity: 1,
              ease: 'power3.out',
              scrollTrigger: {
                trigger: '#recorrido-migracion',
                start: 'top 78%',
                end: 'center center',
                scrub: 0.6
              }
            }
          );
        }

        // Barra de cuota IA 48/100 animada
        const quotaBar = document.getElementById('gsap-quota-bar');
        if (quotaBar) {
          gsap.fromTo(quotaBar,
            { width: '0%' },
            {
              width: '48%',
              duration: 1.4,
              ease: 'expo.out',
              scrollTrigger: {
                trigger: '#floating-quota-widget',
                start: 'top 90%'
              }
            }
          );
        }

        // Entrada escalonada de los 5 Planes
        gsap.from('.gsap-plan-card', {
          y: 50,
          opacity: 0,
          stagger: 0.09,
          duration: 0.75,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '#landing-plans-grid',
            start: 'top 84%'
          }
        });
      }

      /* ── 6. TELEMETRÍA EN VIVO Y COMPARADOR DESLIZANTE (SECCIÓN 02) ── */
      function initBiometricTelemetryAndCompare() {
        const xyzEl = document.getElementById('telemetry-xyz');
        if (xyzEl) {
          setInterval(() => {
            const pitch = (1.5 + Math.random() * 1.8).toFixed(1);
            const yaw = (-1.2 + Math.random() * 2.4).toFixed(1);
            xyzEl.textContent = `PITCH: +${pitch}° · YAW: ${yaw}°`;
          }, 950);
        }

        // Slider interactivo al mover el mouse sobre el retrato de resultado (Tarjeta 03)
        const portraitBox = document.getElementById('interactive-compare-portrait');
        const beforeLayer = document.getElementById('before-portrait-layer');
        const sliderLine = document.getElementById('portrait-slider-line');
        const chipText = document.getElementById('verified-chip-text');

        if (!portraitBox || !beforeLayer || !sliderLine) return;

        portraitBox.addEventListener('mousemove', (e) => {
          const rect = portraitBox.getBoundingClientRect();
          const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
          beforeLayer.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
          sliderLine.style.left = pct + '%';
          sliderLine.classList.add('is-active');
          if (chipText) {
            chipText.textContent = pct > 50 ? 'Foto original del cliente' : 'Calce IA 99.2%';
          }
        });

        portraitBox.addEventListener('mouseleave', () => {
          beforeLayer.style.clipPath = 'inset(0 100% 0 0)';
          sliderLine.classList.remove('is-active');
          if (chipText) chipText.textContent = 'Calce IA 99.2%';
        });
      }

      function initMobileMenu() {
        const btn = document.getElementById('mobile-menu-toggle');
        const nav = document.getElementById('main-nav-links');
        if (!btn || !nav) return;
        btn.addEventListener('click', () => {
          nav.classList.toggle('is-mobile-open');
        });
        nav.querySelectorAll('a').forEach((link) => {
          link.addEventListener('click', () => nav.classList.remove('is-mobile-open'));
        });
      }

      function initHeroSwitcher() {
        const heroImg = document.getElementById('hero-masked-img');
        const heroThumb = document.getElementById('hero-mini-thumb');
        const heroTitle = document.getElementById('hero-floating-title');
        document.querySelectorAll('.hero-mode-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.hero-mode-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            const newImg = btn.getAttribute('data-hero-img');
            const newLabel = btn.getAttribute('data-hero-label');
            if (heroImg && newImg) heroImg.src = newImg;
            if (heroThumb && newImg) heroThumb.src = newImg;
            if (heroTitle && newLabel) heroTitle.textContent = newLabel;
          });
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

        document.querySelectorAll('section[id]').forEach((sec) => {
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

        document.querySelectorAll('.tryon-flow-card').forEach((card) => {
          card.addEventListener('click', (e) => {
            if (e.target.closest('a') || e.target.closest('button')) return;
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
        const cartBtnPrice = document.getElementById('cart-btn-price');
        const resultMiniImg = document.getElementById('tryon-result-mini-img');
        const resultPortrait = document.getElementById('tryon-result-portrait-img');

        document.querySelectorAll('.side-thumb-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.side-thumb-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            const imgSrc = btn.getAttribute('data-img');
            const resSrc = btn.getAttribute('data-result');
            const nameTxt = btn.getAttribute('data-name');
            const subTxt = btn.getAttribute('data-sub');
            const priceTxt = btn.getAttribute('data-price');

            if (productImg && imgSrc) productImg.src = imgSrc;
            if (productName && nameTxt) productName.textContent = nameTxt;
            if (productType && subTxt) productType.textContent = subTxt;
            if (productPrice && priceTxt) productPrice.textContent = priceTxt;
            if (cartBtnPrice && priceTxt) cartBtnPrice.textContent = priceTxt;
            if (resultPortrait && resSrc) resultPortrait.src = resSrc;
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

        // Botón Simular Escaneo IA
        const simBtn = document.getElementById('btn-simulate-scan');
        const aiStatus = document.getElementById('ai-status-dynamic');
        if (simBtn) {
          simBtn.addEventListener('click', () => {
            userManuallySelectedStep = true;
            setTryOnStage(2);
            if (aiStatus) aiStatus.textContent = 'Mapeando 468 puntos...';
            showToast('Escaneando geometría facial con IA...');
            setTimeout(() => {
              if (aiStatus) aiStatus.textContent = 'Calce completado';
              setTryOnStage(3);
              showToast('✓ Calce generado en 1.8 segundos');
            }, 1250);
          });
        }

        // Botón alternar Antes / Después en Tarjeta 3
        const compareBtn = document.getElementById('btn-compare-before');
        const beforeLayer = document.getElementById('before-portrait-layer');
        const chipText = document.getElementById('verified-chip-text');
        let showingOriginal = false;
        if (compareBtn && beforeLayer) {
          compareBtn.addEventListener('click', () => {
            showingOriginal = !showingOriginal;
            beforeLayer.style.clipPath = showingOriginal ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)';
            compareBtn.textContent = showingOriginal ? 'Ver con accesorio IA' : '⇄ Antes / Después';
            if (chipText) {
              chipText.textContent = showingOriginal ? 'Foto original del cliente' : 'Calce IA 99.2%';
            }
          });
        }

        const addCartBtn = document.getElementById('btn-demo-add-cart');
        if (addCartBtn) {
          addCartBtn.addEventListener('click', () => {
            const currentProd = productName ? productName.textContent : 'Accesorio';
            showToast(`"${currentProd}" agregado al carrito de demostración`);
          });
        }

        return {
          isManual: () => userManuallySelectedStep,
          forceManual: () => { userManuallySelectedStep = true; }
        };
      }

      function initCatalogStorefront(tryOnState) {
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
        const visibleCountEl = document.getElementById('catalog-visible-count');
        const emptyState = document.getElementById('catalog-empty-state');

        let activeCategory = 'todos';

        function formatArs(num) {
          return '$' + Number(num).toLocaleString('es-AR');
        }

        function applyFilters() {
          const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
          const maxPrice = priceRange ? Number(priceRange.value) : 60000;
          const selectedBrands = brandChecks.filter((c) => c.checked).map((c) => c.value);
          let visibleCount = 0;

          cards.forEach((card) => {
            const cat = card.getAttribute('data-category') || '';
            const brand = card.getAttribute('data-brand') || '';
            const price = Number(card.getAttribute('data-price') || 0);
            const title = (card.querySelector('.item-title')?.textContent || '').toLowerCase();

            const matchCat = activeCategory === 'todos' || cat === activeCategory;
            const matchQuery = !query || title.includes(query) || cat.includes(query) || brand.toLowerCase().includes(query);
            const matchPrice = price <= maxPrice;
            const matchBrand = selectedBrands.length === 0 || selectedBrands.includes(brand);

            const isVisible = matchCat && matchQuery && matchPrice && matchBrand;
            card.classList.toggle('is-hidden', !isVisible);
            if (isVisible) visibleCount++;
          });

          if (visibleCountEl) {
            visibleCountEl.textContent = `Mostrando ${visibleCount} ${visibleCount === 1 ? 'producto' : 'productos'}`;
          }
          if (emptyState) {
            emptyState.classList.toggle('is-visible', visibleCount === 0);
          }

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
            if (emptyState) grid.appendChild(emptyState);
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
            if (!liked) showToast('Guardado en tus favoritos');
          });
        });

        document.querySelectorAll('.item-try-link').forEach((btn) => {
          btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-try-name');
            const price = btn.getAttribute('data-try-price');
            const img = btn.getAttribute('data-try-img');
            const prodImg = document.getElementById('tryon-demo-product-img');
            const prodName = document.getElementById('tryon-demo-product-name');
            const prodPrice = document.getElementById('tryon-demo-product-price');
            const cartPrice = document.getElementById('cart-btn-price');

            if (prodImg && img) prodImg.src = img;
            if (prodName && name) prodName.textContent = name;
            if (prodPrice && price) prodPrice.textContent = price;
            if (cartPrice && price) cartPrice.textContent = price;

            if (tryOnState) tryOnState.forceManual();
            setTryOnStage(2);
            document.getElementById('recorrido-probador')?.scrollIntoView({ behavior: 'smooth' });
            showToast(`Escaneando "${name}" en el Probador IA...`);
            setTimeout(() => {
              setTryOnStage(3);
            }, 1300);
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

      function initBillingToggle() {
        const buttons = document.querySelectorAll('.billing-opt-btn');
        const usdPrices = document.querySelectorAll('.plan-price[data-usd-month]');
        const arsPrices = document.querySelectorAll('.ars-price[data-ars-month]');

        buttons.forEach((btn) => {
          btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-billing');
            buttons.forEach((b) => b.classList.toggle('active', b === btn));

            usdPrices.forEach((el) => {
              el.textContent = mode === 'annual'
                ? el.getAttribute('data-usd-year')
                : el.getAttribute('data-usd-month');
            });

            arsPrices.forEach((el) => {
              el.textContent = mode === 'annual'
                ? el.getAttribute('data-ars-year')
                : el.getAttribute('data-ars-month');
            });
          });
        });
      }

      function initFaqAccordion() {
        document.querySelectorAll('.faq-question').forEach((btn) => {
          btn.addEventListener('click', () => {
            const item = btn.closest('.faq-item');
            if (!item) return;
            const isOpen = item.classList.contains('is-open');
            document.querySelectorAll('.faq-item').forEach((el) => el.classList.remove('is-open'));
            if (!isOpen) item.classList.add('is-open');
          });
        });
      }

      function initScrollProgressBar() {
        const progressBar = document.getElementById('scroll-progress-bar');
        if (!progressBar) return;
        window.addEventListener('scroll', () => {
          const scrollY = window.scrollY || window.pageYOffset || 0;
          const vh = window.innerHeight || 800;
          const docHeight = Math.max(1, document.documentElement.scrollHeight - vh);
          const totalProgress = Math.min(1, Math.max(0.02, scrollY / docHeight));
          progressBar.style.transform = `scaleX(${totalProgress.toFixed(3)})`;
        }, { passive: true });
      }

      window.addEventListener('load', () => {
        initLenisAndGSAP();
        initKineticIntro();
        initMagneticCursor();
        initHero3DTilt();
        initBiometricTelemetryAndCompare();
        initMobileMenu();
        initHeroSwitcher();
        initActiveNavObserver();
        const tryOnState = initTryOnControls();
        initCatalogStorefront(tryOnState);
        initAdminCapabilityTabs();
        initBillingToggle();
        initFaqAccordion();
        initScrollAnimations(tryOnState);
        initScrollProgressBar();
      });
    })();