/**
 * CAPFIT - Store Pages DOM Renderer
 * Handles rendering of dynamic store sections and informational views.
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

  const PagesRenderer = {
    renderHome(d) {
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

    renderAbout(d) {
      if (!d) return;
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

    renderFAQ(d) {
      if (!d) return;
      const subtitleEl = document.getElementById('faq-display-subtitle');
      if (subtitleEl && d.subtitle) {
        subtitleEl.textContent = d.subtitle;
      }

      const listContainer = document.getElementById('faq-list-container');
      if (listContainer && Array.isArray(d.items) && d.items.length > 0) {
        listContainer.innerHTML = d.items.map((item, idx) => `
          <div class="faq-item ${idx === 0 ? 'open' : ''}" data-cat="${escapeHtml(item.cat || 'ia')}">
            <div class="faq-question" onclick="window.FAQManager ? window.FAQManager.toggle(this) : null">
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

    renderEnvios(d) {
      if (!d) return;
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

    renderCambios(d) {
      if (!d) return;
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

    renderContacto(d) {
      if (!d) return;
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

    renderTerminos(d) {
      if (!d) return;
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

    renderPrivacidad(d) {
      if (!d) return;
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
    }
  };

  window.PagesRenderer = PagesRenderer;
})();
