/**
 * CAPFIT - Store Sections & Informational Pages Manager
 * Multi-tenant dynamic content system connected to Firebase Firestore:
 * - Sobre Nosotros
 * - FAQ (Preguntas Frecuentes)
 * - Envíos y Entregas
 * - Cambios y Devoluciones
 * - Contacto y Showroom
 * - Términos y Condiciones
 * - Política de Privacidad
 */

(function() {
  'use strict';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const PagesManager = {
    getStorageKey(storeId) {
      const sId = storeId || (window.Store ? window.Store.getCurrentStoreId() : 'principal');
      return `capfit_sections_${sId}`;
    },

    getDefaultSections(store) {
      const currentStore = store || (window.Store ? window.Store.getCurrentStore() : null);
      const storeName = currentStore && currentStore.name ? currentStore.name : 'CAPFIT';
      const storeSubdomain = currentStore && currentStore.subdomain ? currentStore.subdomain : 'capfit';
      const defaultEmail = currentStore && currentStore.ownerEmail ? currentStore.ownerEmail : `contacto@${storeSubdomain}.capfit.shop`;
      const defaultPhone = '+54 9 11 5555-0199';
      const defaultLocation = 'Buenos Aires, Argentina';

      return {
        home: {
          heroTitle: (currentStore && currentStore.heroTitle) || 'Probátela.\nComprá con confianza.',
          heroSubtitle: (currentStore && currentStore.tagline) || 'Usá IA para verte con tus gorras favoritas antes de comprarlas.',
          heroBadge: '🔥 PROBADOR CON IA EN VIVO',
          heroCtaPrimary: 'PROBAR AHORA →',
          heroCtaSecondary: 'Ver catálogo',
          heroProofCount: '+3.500 personas ya probaron',
          heroRatingText: '★★★★★ 4.9 (327 opiniones)',
          announcementActive: true,
          announcementText1: 'Envío gratis en compras mayores a $39.999',
          announcementText2: '30 días para cambios y devoluciones',
          announcementText3: '¿Necesitás ayuda? Escribinos por WhatsApp',
          trust1Title: 'Probá en 3 pasos',
          trust1Desc: 'Elegí, subí tu foto y mirá el resultado.',
          trust2Title: 'Envíos a todo el país',
          trust2Desc: 'Envío gratis en compras mayores a $39.999.',
          trust3Title: '30 días para cambios',
          trust3Desc: 'Si no te convence, lo cambiás sin problema.',
          trust4Title: 'Compra 100% segura',
          trust4Desc: 'Tus datos están protegidos siempre.',
          catalogHeadline: 'Gorras más vendidas'
        },
        about: {
          brandName: storeName,
          tagline: (currentStore && currentStore.tagline) || 'Probadores virtuales de gorras y accesorios con IA. Comprá con confianza, probá primero.',
          story: `En ${storeName} fusionamos diseño de autor, materiales de máxima calidad y tecnología de probador virtual con Inteligencia Artificial. Nacimos para que puedas ver exactamente cómo te queda cada gorra o accesorio en tiempo real antes de recibirlo en tu casa.`,
          mission: `Brindar a cada cliente la seguridad de elegir el producto perfecto antes de comprar, combinando vanguardia tecnológica con la mejor experiencia de compra.`,
          vision: `Ser la marca y plataforma referente en accesorios urbanos con probadores virtuales en Argentina y Latinoamérica.`,
          quality: `Selección rigurosa de tejidos, sarga de algodón de alto gramaje, costuras reforzadas indeformables y herrajes anatómicos.`,
          foundedYear: '2024',
          location: defaultLocation,
          email: defaultEmail,
          phone: defaultPhone,
          statsHappyClients: '+3.500',
          statsTryonAccuracy: '99.2%',
          statsFastShipping: '24-48 hs'
        },
        faq: {
          subtitle: 'Encontrá respuestas rápidas sobre el probador con IA, envíos, medios de pago y garantías de compra.',
          items: [
            {
              id: 'faq-1',
              cat: 'ia',
              q: '¿Cómo funciona el probador virtual con Inteligencia Artificial?',
              a: `En ${storeName} utilizamos visión computacional para calibrar el tamaño, ángulo e iluminación de la prenda en tu rostro. Podés subir una foto o usar tu cámara en vivo y probarte cualquier modelo al instante.`
            },
            {
              id: 'faq-2',
              cat: 'ia',
              q: '¿Mis fotos quedan guardadas o son privadas?',
              a: 'Tu privacidad es total. Tu foto se procesa de forma efímera en la memoria de la sesión y se destruye inmediatamente después. Nunca almacenamos fotos biométricas ni las compartimos con nadie.'
            },
            {
              id: 'faq-3',
              cat: 'envios',
              q: '¿Cuánto tarda en llegar mi pedido y cuánto cuesta el envío?',
              a: 'Para CABA y Gran Buenos Aires las entregas se realizan entre 24 y 48 horas hábiles. Para el resto del país, entre 3 y 5 días hábiles vía Andreani o Correo Argentino. En compras que superen los $40.000, ¡el envío estándar es 100% gratuito!'
            },
            {
              id: 'faq-4',
              cat: 'pagos',
              q: '¿Cuáles son los medios de pago aceptados?',
              a: 'Procesamos todos los pagos a través de Mercado Pago con la máxima seguridad antifraude. Podés pagar con tarjetas de crédito, débito, transferencias y dinero en cuenta.'
            },
            {
              id: 'faq-5',
              cat: 'garantia',
              q: '¿Qué hago si el producto no me queda como esperaba?',
              a: 'Contás con 30 días corridos desde que recibís tu pedido para solicitar un cambio de talle o modelo o la devolución de tu dinero. El primer cambio es sin costo alguno para vos.'
            }
          ]
        },
        envios: {
          freeShippingThreshold: 40000,
          freeShippingBanner: '¡Envío Gratis disponible! En compras superiores a $40.000 a cualquier punto del país.',
          standardTitle: 'Envío Estándar Nacional',
          standardTime: '3 a 5 días hábiles',
          standardCarrier: 'Despachado a través de Andreani o Correo Argentino con seguimiento en tiempo real directo a tu puerta o sucursal más cercana.',
          expressTitle: 'Express CABA y GBA',
          expressTime: '24 a 48 hs hábiles',
          expressDesc: 'Servicio de mensajería prioritario para compras realizadas de Lunes a Viernes antes de las 13:00 hs en el Área Metropolitana.',
          pickupTitle: 'Retiro en Sucursal / Showroom',
          pickupTime: 'Gratis / Inmediato',
          pickupAddress: defaultLocation,
          packagingTitle: 'Embalaje Protector Reforzado',
          packagingDesc: 'Sabemos que una gorra abollada o con la visera doblada arruina la compra. Por eso, cada producto se despacha en cajas rígidas con soporte interno anatómico para que llegue con su horma original intacta.'
        },
        cambios: {
          daysGuarantee: 30,
          bannerTitle: '30 Días Corridos de Garantía Sin Preguntas',
          bannerDesc: 'Tenés hasta 30 días posteriores a la fecha de recepción para solicitar un cambio de producto o la devolución de tu dinero. El primer cambio de talle o modelo no tiene costo de flete.',
          step1Title: 'Contactanos',
          step1Desc: `Escribinos por WhatsApp al ${defaultPhone} o a ${defaultEmail} indicando tu número de pedido y el motivo del cambio.`,
          step2Title: 'Despachá el Paquete',
          step2Desc: 'Te enviamos una etiqueta prepaga para que dejes el paquete en la sucursal de correo más cercana sin abonar nada.',
          step3Title: 'Recibí o Reintegrá',
          step3Desc: 'Una vez verificado el paquete, despachamos el nuevo modelo elegido o te reintegramos el 100% de lo abonado.',
          cond1: 'El producto debe estar nuevo, sin uso, sin perfumes ni marcas de maquillaje.',
          cond2: 'Conservar la etiqueta original colocada y el empaque o caja rígida protectora.',
          cond3: 'Presentar el número de orden o comprobante de compra digital enviado por email.',
          whatsappNumber: defaultPhone
        },
        contacto: {
          whatsapp: defaultPhone,
          whatsappDesc: 'Respuesta rápida (menos de 15 min)',
          email: defaultEmail,
          emailDesc: 'Para cotizaciones mayoristas, pedidos o soporte de compra',
          hoursTitle: 'Horarios de Atención',
          hoursDesc: 'Lunes a Sábados de 9:00 a 20:00 hs',
          locationTitle: 'Punto de Entrega & Showroom',
          locationDesc: defaultLocation,
          headerTitle: 'Contactanos',
          headerSubtitle: 'Estamos disponibles para resolver tus dudas, asesorarte con tu compra o ayudarte con el probador virtual con IA.'
        },
        terminos: {
          lastUpdated: 'Enero 2026',
          art1Title: '1. Aceptación de los Términos',
          art1Body: `Al acceder, navegar o realizar transacciones en ${storeName} y sus servicios asociados, el usuario declara haber leído, comprendido y aceptado en su totalidad los presentes Términos y Condiciones.`,
          art2Title: '2. Uso del Probador Virtual con IA',
          art2Body: 'El probador virtual es una herramienta orientativa basada en modelos de Inteligencia Artificial para estimar el calce visual de accesorios. Las imágenes resultantes constituyen representaciones simuladas de alta fidelidad.',
          art3Title: '3. Precios y Moneda',
          art3Body: 'Todos los precios publicados en el catálogo están expresados en pesos argentinos (ARS) e incluyen los impuestos correspondientes.',
          art4Title: '4. Disponibilidad y Despacho',
          art4Body: 'El compromiso de entrega de los productos está sujeto a la disponibilidad de stock físico. En caso de agotarse un artículo, ofreceremos un cambio inmediato o reembolso íntegro.',
          art5Title: '5. Propiedad Intelectual',
          art5Body: `Todos los logotipos, imágenes y diseños son propiedad exclusiva de ${storeName} y se encuentran protegidos por las leyes vigentes.`,
          art6Title: '6. Jurisdicción y Ley Aplicable',
          art6Body: 'Los presentes Términos y Condiciones se rigen por las leyes de la República Argentina.'
        },
        privacidad: {
          art1Title: '1. Privacidad por Diseño en el Probador Virtual',
          art1Body: 'Las fotografías o capturas utilizadas en el Probador IA se procesan de forma efímera en la memoria volátil de la sesión. Nunca almacenamos rasgos faciales ni fotos biométricas en servidores permanentes.',
          art2Title: '2. Datos Recopilados en el Proceso de Compra',
          art2Body: 'Únicamente recopilamos los datos personales estrictamente necesarios para procesar y despachar tu pedido: nombre, dirección, teléfono y correo electrónico.',
          art3Title: '3. Seguridad de Pagos',
          art3Body: 'No almacenamos datos financieros sensibles. Todas las transacciones se canalizan de manera cifrada a través de Mercado Pago con certificación PCI-DSS.',
          art4Title: '4. Derechos del Titular de los Datos',
          art4Body: `De conformidad con la Ley N° 25.326, podés solicitar acceso, rectificación o eliminación de tus datos escribiendo a ${defaultEmail}.`
        }
      };
    },

    getSections(storeId) {
      const sId = storeId || (window.Store ? window.Store.getCurrentStoreId() : 'principal');
      const defaults = this.getDefaultSections();
      try {
        const raw = localStorage.getItem(this.getStorageKey(sId));
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            home: { ...defaults.home, ...(parsed.home || {}) },
            about: { ...defaults.about, ...(parsed.about || {}) },
            faq: { ...defaults.faq, ...(parsed.faq || {}) },
            envios: { ...defaults.envios, ...(parsed.envios || {}) },
            cambios: { ...defaults.cambios, ...(parsed.cambios || {}) },
            contacto: { ...defaults.contacto, ...(parsed.contacto || {}) },
            terminos: { ...defaults.terminos, ...(parsed.terminos || {}) },
            privacidad: { ...defaults.privacidad, ...(parsed.privacidad || {}) }
          };
        }
      } catch (e) {
        console.warn('[PagesManager] Error reading sections from localStorage:', e);
      }
      return defaults;
    },

    getSection(sectionKey, storeId) {
      const all = this.getSections(storeId);
      return all[sectionKey] || {};
    },

    async fetchCloudData(storeId) {
      const sId = storeId || (window.Store ? window.Store.getCurrentStoreId() : 'principal');
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(sId)}/sections`);
        if (res.ok) {
          const json = await res.json();
          if (json && json.sections) {
            localStorage.setItem(this.getStorageKey(sId), JSON.stringify(json.sections));
            this.renderAll();
          }
        }
      } catch (err) {
        console.warn('[PagesManager] Cloud sync notice:', err);
      }
    },

    async saveSection(sectionKey, sectionData, storeId) {
      const sId = storeId || (window.Store ? window.Store.getCurrentStoreId() : 'principal');
      const current = this.getSections(sId);
      current[sectionKey] = { ...(current[sectionKey] || {}), ...sectionData };

      // Guardar local
      try {
        localStorage.setItem(this.getStorageKey(sId), JSON.stringify(current));
      } catch (e) {
        console.error(e);
      }

      this.renderAll();

      // Guardar en Firestore vía backend
      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(sId)}/sections`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionKey, data: sectionData })
        });
        const json = await res.json();
        if (json && json.ok) {
          if (window.showToast) {
            window.showToast(`✅ Sección guardada en Firebase Firestore (${sId})`);
          }
        }
        return json;
      } catch (err) {
        console.error('Error syncing section to Firestore:', err);
        throw err;
      }
    },

    resetSection(sectionKey, storeId) {
      const sId = storeId || (window.Store ? window.Store.getCurrentStoreId() : 'principal');
      const defaults = this.getDefaultSections();
      if (defaults[sectionKey]) {
        this.saveSection(sectionKey, defaults[sectionKey], sId);
        if (window.showToast) window.showToast('Valores restaurados por defecto');
      }
    },

    openAdminEditor(sectionKey) {
      if (typeof window.navigateToView === 'function') {
        window.navigateToView('admin');
      }
      if (window.AdminPanel && typeof window.AdminPanel.openSectionsEditor === 'function') {
        window.AdminPanel.openSectionsEditor(sectionKey);
      }
    },

    // ── RENDERIZADO DINÁMICO DE VISTAS ──
    renderAll() {
      const sections = this.getSections();
      this.renderHome(sections.home);
      this.renderAbout(sections.about);
      this.renderFAQ(sections.faq);
      this.renderEnvios(sections.envios);
      this.renderCambios(sections.cambios);
      this.renderContacto(sections.contacto);
      this.renderTerminos(sections.terminos);
      this.renderPrivacidad(sections.privacidad);
    },

    renderHome(data) {
      const d = data || this.getSection('home');
      if (!d) return;

      const heroTitle = document.getElementById('hero-display-title');
      if (heroTitle && d.heroTitle) {
        heroTitle.innerHTML = escapeHtml(d.heroTitle).replace(/\n/g, '<br>');
      }

      const heroSub = document.getElementById('hero-display-sub');
      if (heroSub && d.heroSubtitle) {
        heroSub.textContent = d.heroSubtitle;
      }

      const heroCta = document.getElementById('hero-display-cta');
      if (heroCta && d.heroCtaPrimary) {
        heroCta.textContent = d.heroCtaPrimary;
      }

      const heroProof = document.getElementById('hero-display-proof');
      if (heroProof && d.heroProofCount) {
        heroProof.textContent = d.heroProofCount;
      }

      const heroRating = document.getElementById('hero-display-rating');
      if (heroRating && d.heroRatingText) {
        heroRating.textContent = d.heroRatingText;
      }

      // Barra superior de anuncios
      const topBanner = document.getElementById('main-top-banner');
      if (topBanner) {
        if (d.announcementActive === false) {
          topBanner.style.display = 'none';
        } else {
          topBanner.style.display = 'flex';
          const b1 = document.getElementById('top-banner-item-1');
          const b2 = document.getElementById('top-banner-item-2');
          const b3 = document.getElementById('top-banner-item-3');
          if (b1 && d.announcementText1) b1.textContent = d.announcementText1;
          if (b2 && d.announcementText2) b2.textContent = d.announcementText2;
          if (b3 && d.announcementText3) b3.textContent = d.announcementText3;
        }
      }

      // Tarjetas de confianza
      const t1t = document.getElementById('trust-card-title-1');
      const t1d = document.getElementById('trust-card-desc-1');
      if (t1t && d.trust1Title) t1t.textContent = d.trust1Title;
      if (t1d && d.trust1Desc) t1d.textContent = d.trust1Desc;

      const t2t = document.getElementById('trust-card-title-2');
      const t2d = document.getElementById('trust-card-desc-2');
      if (t2t && d.trust2Title) t2t.textContent = d.trust2Title;
      if (t2d && d.trust2Desc) t2d.textContent = d.trust2Desc;

      const t3t = document.getElementById('trust-card-title-3');
      const t3d = document.getElementById('trust-card-desc-3');
      if (t3t && d.trust3Title) t3t.textContent = d.trust3Title;
      if (t3d && d.trust3Desc) t3d.textContent = d.trust3Desc;

      const t4t = document.getElementById('trust-card-title-4');
      const t4d = document.getElementById('trust-card-desc-4');
      if (t4t && d.trust4Title) t4t.textContent = d.trust4Title;
      if (t4d && d.trust4Desc) t4d.textContent = d.trust4Desc;

      const catHead = document.getElementById('catalog-display-headline');
      if (catHead && d.catalogHeadline) catHead.textContent = d.catalogHeadline;
    },

    renderAbout(data) {
      const d = data || this.getSection('about');
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '';
      };

      setTxt('about-display-brand', d.brandName);
      setTxt('about-display-tagline', d.tagline);
      setTxt('about-display-story', d.story);
      setTxt('about-display-mission', d.mission);
      setTxt('about-display-vision', d.vision);
      setTxt('about-display-quality', d.quality);
      setTxt('about-display-year', d.foundedYear);
      setTxt('about-display-location', d.location);
      setTxt('about-display-email', d.email);
      setTxt('about-display-phone', d.phone);
      setTxt('about-display-stat-clients', d.statsHappyClients);
      setTxt('about-display-stat-acc', d.statsTryonAccuracy);
      setTxt('about-display-stat-ship', d.statsFastShipping);

      const heroEl = document.getElementById('about-hero-title');
      if (heroEl) {
        heroEl.innerHTML = `Conocé la historia de <span class="highlight-text">${escapeHtml(d.brandName || 'nuestra marca')}</span>`;
      }
    },

    renderFAQ(data) {
      const d = data || this.getSection('faq');
      const subtitleEl = document.getElementById('faq-display-subtitle');
      if (subtitleEl && d.subtitle) {
        subtitleEl.textContent = d.subtitle;
      }

      const listContainer = document.getElementById('faq-list-container');
      if (listContainer && Array.isArray(d.items) && d.items.length > 0) {
        listContainer.innerHTML = d.items.map((item, idx) => `
          <div class="faq-item ${idx === 0 ? 'open' : ''}" data-cat="${escapeHtml(item.cat || 'ia')}">
            <div class="faq-question" onclick="FAQManager.toggle(this)">
              <span>${escapeHtml(item.q)}</span>
              <span class="faq-toggle-icon">+</span>
            </div>
            <div class="faq-answer">
              ${escapeHtml(item.a)}
            </div>
          </div>
        `).join('');
      }
    },

    renderEnvios(data) {
      const d = data || this.getSection('envios');
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '';
      };

      const bannerEl = document.getElementById('envios-free-banner');
      if (bannerEl && d.freeShippingBanner) {
        bannerEl.innerHTML = `🚚 <strong>¡Envío Gratis!</strong> ${escapeHtml(d.freeShippingBanner)}`;
      }

      setTxt('envios-standard-title', d.standardTitle);
      setTxt('envios-standard-time', d.standardTime);
      setTxt('envios-standard-desc', d.standardCarrier);

      setTxt('envios-express-title', d.expressTitle);
      setTxt('envios-express-time', d.expressTime);
      setTxt('envios-express-desc', d.expressDesc);

      setTxt('envios-pickup-title', d.pickupTitle);
      setTxt('envios-pickup-time', d.pickupTime);
      setTxt('envios-pickup-desc', d.pickupAddress ? `Punto de entrega: ${d.pickupAddress}. Retiro con cita previa una vez acreditado el pago.` : '');

      setTxt('envios-packaging-title', d.packagingTitle);
      setTxt('envios-packaging-desc', d.packagingDesc);
    },

    renderCambios(data) {
      const d = data || this.getSection('cambios');
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '';
      };

      setTxt('cambios-banner-title', d.bannerTitle);
      setTxt('cambios-banner-desc', d.bannerDesc);

      setTxt('cambios-step1-title', d.step1Title);
      setTxt('cambios-step1-desc', d.step1Desc);

      setTxt('cambios-step2-title', d.step2Title);
      setTxt('cambios-step2-desc', d.step2Desc);

      setTxt('cambios-step3-title', d.step3Title);
      setTxt('cambios-step3-desc', d.step3Desc);

      setTxt('cambios-cond1', d.cond1);
      setTxt('cambios-cond2', d.cond2);
      setTxt('cambios-cond3', d.cond3);

      const waLink = document.getElementById('cambios-whatsapp-link');
      if (waLink && d.whatsappNumber) {
        const cleanPhone = String(d.whatsappNumber).replace(/[^0-9]/g, '');
        waLink.href = `https://wa.me/${cleanPhone}?text=Hola,%20quiero%20solicitar%20un%20cambio%20de%20mi%20pedido`;
      }
    },

    renderContacto(data) {
      const d = data || this.getSection('contacto');
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '';
      };

      setTxt('contacto-header-title', d.headerTitle);
      setTxt('contacto-header-subtitle', d.headerSubtitle);

      setTxt('contacto-whatsapp-num', d.whatsapp);
      setTxt('contacto-whatsapp-desc', d.whatsappDesc);
      const waLink = document.getElementById('contacto-whatsapp-link');
      if (waLink && d.whatsapp) {
        const cleanPhone = String(d.whatsapp).replace(/[^0-9]/g, '');
        waLink.href = `https://wa.me/${cleanPhone}?text=Hola,%20tengo%20una%20consulta`;
      }

      setTxt('contacto-email-val', d.email);
      setTxt('contacto-email-desc', d.emailDesc);
      const emailLink = document.getElementById('contacto-email-link');
      if (emailLink && d.email) {
        emailLink.href = `mailto:${encodeURIComponent(d.email)}`;
      }

      setTxt('contacto-hours-title', d.hoursTitle);
      setTxt('contacto-hours-desc', d.hoursDesc);

      setTxt('contacto-location-title', d.locationTitle);
      setTxt('contacto-location-desc', d.locationDesc);
    },

    renderTerminos(data) {
      const d = data || this.getSection('terminos');
      const dateEl = document.getElementById('terminos-updated-date');
      if (dateEl && d.lastUpdated) dateEl.textContent = d.lastUpdated;

      const container = document.getElementById('terminos-articles-container');
      if (container) {
        const articles = [
          { title: d.art1Title || '1. Aceptación de los Términos', body: d.art1Body },
          { title: d.art2Title || '2. Uso del Probador Virtual con IA', body: d.art2Body },
          { title: d.art3Title || '3. Precios y Moneda', body: d.art3Body },
          { title: d.art4Title || '4. Disponibilidad y Despacho', body: d.art4Body },
          { title: d.art5Title || '5. Propiedad Intelectual', body: d.art5Body },
          { title: d.art6Title || '6. Jurisdicción y Ley Aplicable', body: d.art6Body }
        ].filter(a => Boolean(a.body));

        container.innerHTML = articles.map((art, idx) => `
          <div class="legal-article-section" style="${idx === articles.length - 1 ? 'border-bottom:none;margin-bottom:0;padding-bottom:0' : ''}">
            <h3 class="legal-article-title">${escapeHtml(art.title)}</h3>
            <p class="legal-article-body">${escapeHtml(art.body)}</p>
          </div>
        `).join('');
      }
    },

    renderPrivacidad(data) {
      const d = data || this.getSection('privacidad');
      const container = document.getElementById('privacidad-articles-container');
      if (container) {
        const articles = [
          { title: d.art1Title || '1. Privacidad por Diseño en el Probador Virtual', body: d.art1Body },
          { title: d.art2Title || '2. Datos Recopilados en el Proceso de Compra', body: d.art2Body },
          { title: d.art3Title || '3. Seguridad de Pagos', body: d.art3Body },
          { title: d.art4Title || '4. Derechos del Titular de los Datos', body: d.art4Body }
        ].filter(a => Boolean(a.body));

        container.innerHTML = articles.map((art, idx) => `
          <div class="legal-article-section" style="${idx === articles.length - 1 ? 'border-bottom:none;margin-bottom:0;padding-bottom:0' : ''}">
            <h3 class="legal-article-title">${escapeHtml(art.title)}</h3>
            <p class="legal-article-body">${escapeHtml(art.body)}</p>
          </div>
        `).join('');
      }
    },

    // ── RETROCOMPATIBILIDAD CON SobreNosotros ──
    getData() {
      return this.getSection('about');
    },
    saveData(data) {
      this.saveSection('about', data);
      this.closeCustomizer();
    },
    resetData() {
      this.resetSection('about');
      this.populateCustomizerForm();
    },
    render() {
      this.renderAbout();
    },
    openCustomizer() {
      const panel = document.getElementById('about-customizer-panel');
      if (!panel) return;
      this.populateCustomizerForm();
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    closeCustomizer() {
      const panel = document.getElementById('about-customizer-panel');
      if (panel) panel.style.display = 'none';
    },
    populateCustomizerForm() {
      const d = this.getSection('about');
      const setVal = (id, val) => {
        const input = document.getElementById(id);
        if (input) input.value = val || '';
      };
      setVal('edit-about-brand', d.brandName);
      setVal('edit-about-tagline', d.tagline);
      setVal('edit-about-story', d.story);
      setVal('edit-about-mission', d.mission);
      setVal('edit-about-vision', d.vision);
      setVal('edit-about-quality', d.quality);
      setVal('edit-about-year', d.foundedYear);
      setVal('edit-about-location', d.location);
      setVal('edit-about-email', d.email);
      setVal('edit-about-phone', d.phone);
    },
    submitCustomizer(e) {
      if (e) e.preventDefault();
      const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
      };
      const cur = this.getSection('about');
      const updated = {
        ...cur,
        brandName: getVal('edit-about-brand') || cur.brandName,
        tagline: getVal('edit-about-tagline') || cur.tagline,
        story: getVal('edit-about-story') || cur.story,
        mission: getVal('edit-about-mission') || cur.mission,
        vision: getVal('edit-about-vision') || cur.vision,
        quality: getVal('edit-about-quality') || cur.quality,
        foundedYear: getVal('edit-about-year') || cur.foundedYear,
        location: getVal('edit-about-location') || cur.location,
        email: getVal('edit-about-email') || cur.email,
        phone: getVal('edit-about-phone') || cur.phone
      };
      this.saveData(updated);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // FAQ ACCORDION & SEARCH
  // ══════════════════════════════════════════════════════════════
  const FAQManager = {
    toggle(element) {
      const item = element.closest('.faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) {
        item.classList.add('open');
      }
    },

    filter(query) {
      const q = (query || '').toLowerCase().trim();
      const items = document.querySelectorAll('.faq-item');
      let visibleCount = 0;
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        const matches = text.includes(q);
        item.style.display = matches ? 'block' : 'none';
        if (matches) visibleCount++;
      });

      const empty = document.getElementById('faq-empty-search');
      if (empty) {
        empty.style.display = (visibleCount === 0 && q !== '') ? 'block' : 'none';
      }
    },

    filterByCategory(category, btn) {
      document.querySelectorAll('.faq-category-pill').forEach(p => p.classList.remove('active'));
      if (btn) btn.classList.add('active');

      const items = document.querySelectorAll('.faq-item');
      items.forEach(item => {
        if (!category || category === 'todas') {
          item.style.display = 'block';
        } else {
          const itemCat = item.getAttribute('data-cat') || '';
          item.style.display = itemCat === category ? 'block' : 'none';
        }
      });
    }
  };

  // ══════════════════════════════════════════════════════════════
  // CONTACT FORM HANDLER
  // ══════════════════════════════════════════════════════════════
  window.handleContactSubmit = function(e) {
    e.preventDefault();
    const form = e.target;
    const name = (form.querySelector('[name="nombre"]') || {}).value || 'Cliente';
    const email = (form.querySelector('[name="email"]') || {}).value || '';
    const asunto = (form.querySelector('[name="asunto"]') || {}).value || 'Consulta general';
    const mensaje = (form.querySelector('[name="mensaje"]') || {}).value || '';

    if (!email || !mensaje) {
      if (window.alert) window.alert('Por favor completá tu correo y el mensaje.');
      return;
    }

    form.reset();
    if (window.showCustomModal) {
      window.showCustomModal({
        title: '¡Mensaje Enviado!',
        message: `Gracias ${name}. Recibimos tu consulta sobre "${asunto}". Te responderemos a ${email} a la brevedad.`,
        icon: 'success',
        buttonText: 'Aceptar'
      });
    } else if (window.showToast) {
      window.showToast('✅ ¡Mensaje enviado con éxito! Te responderemos pronto.');
    }
  };

  // ══════════════════════════════════════════════════════════════
  // TRACKING ORDER LOOKUP
  // ══════════════════════════════════════════════════════════════
  window.handleTrackingLookup = function(e) {
    e.preventDefault();
    const input = document.getElementById('tracking-input');
    const code = (input ? input.value : '').trim().toUpperCase();
    if (!code) {
      if (window.showToast) window.showToast('Ingresá tu código de seguimiento');
      return;
    }

    const resultBox = document.getElementById('tracking-result-box');
    if (!resultBox) return;

    resultBox.style.display = 'block';
    resultBox.innerHTML = `
      <div class="tracking-card-status">
        <div class="tracking-status-badge">📦 En tránsito</div>
        <h4 style="margin:8px 0 4px;font-size:1.05rem;font-weight:700">Envío #${escapeHtml(code)}</h4>
        <p style="font-size:0.85rem;color:var(--gray-600);margin-bottom:12px">Operador logístico: <strong>Andreani Express</strong></p>
        <div class="tracking-steps-timeline">
          <div class="track-step done">✓ Pedido empaquetado y verificado</div>
          <div class="track-step done">✓ Despachado en centro de distribución</div>
          <div class="track-step active">🚚 En camino a tu domicilio (Llega hoy o mañana)</div>
          <div class="track-step pending">○ Entrega final y firma de conformidad</div>
        </div>
      </div>
    `;
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // ══════════════════════════════════════════════════════════════
  // EXPOSE GLOBALS
  // ══════════════════════════════════════════════════════════════
  window.PagesManager = PagesManager;
  window.SobreNosotros = PagesManager;
  window.FAQManager = FAQManager;

  // Render on DOM loaded & on store synced
  document.addEventListener('DOMContentLoaded', () => {
    PagesManager.renderAll();
    PagesManager.fetchCloudData();
  });

  if (window.Store) {
    window.Store.on('store:synced', () => {
      PagesManager.renderAll();
      PagesManager.fetchCloudData();
    });
  }

})();
