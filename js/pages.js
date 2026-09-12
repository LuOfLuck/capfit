/**
 * CAPFIT - Store Sections & Informational Pages Manager (Orchestrator)
 * Multi-tenant dynamic content system connected to Firebase Firestore.
 */
(function() {
  'use strict';

  const PagesManager = {
    getStorageKey(storeId) {
      const sId = storeId || (window.Store ? window.Store.getCurrentStoreId() : 'principal');
      return `capfit_sections_${sId}`;
    },

    getDefaultSections(store) {
      if (window.SectionsData && typeof window.SectionsData.getDefaultSections === 'function') {
        return window.SectionsData.getDefaultSections(store);
      }
      return {};
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

      try {
        localStorage.setItem(this.getStorageKey(sId), JSON.stringify(current));
      } catch (e) {
        console.error(e);
      }

      this.renderAll();

      try {
        const res = await fetch(`/api/stores/${encodeURIComponent(sId)}/sections`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionKey, data: sectionData })
        });
        const json = await res.json();
        if (json && json.ok && window.showToast) {
          window.showToast(`✅ Sección guardada en Firebase Firestore (${sId})`);
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

    // ── RENDERIZADO DINÁMICO DE VISTAS (delegado a PagesRenderer) ──
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
      if (window.PagesRenderer) PagesRenderer.renderHome(data || this.getSection('home'));
    },
    renderAbout(data) {
      if (window.PagesRenderer) PagesRenderer.renderAbout(data || this.getSection('about'));
    },
    renderFAQ(data) {
      if (window.PagesRenderer) PagesRenderer.renderFAQ(data || this.getSection('faq'));
    },
    renderEnvios(data) {
      if (window.PagesRenderer) PagesRenderer.renderEnvios(data || this.getSection('envios'));
    },
    renderCambios(data) {
      if (window.PagesRenderer) PagesRenderer.renderCambios(data || this.getSection('cambios'));
    },
    renderContacto(data) {
      if (window.PagesRenderer) PagesRenderer.renderContacto(data || this.getSection('contacto'));
    },
    renderTerminos(data) {
      if (window.PagesRenderer) PagesRenderer.renderTerminos(data || this.getSection('terminos'));
    },
    renderPrivacidad(data) {
      if (window.PagesRenderer) PagesRenderer.renderPrivacidad(data || this.getSection('privacidad'));
    },

    // ── RETROCOMPATIBILIDAD CON SobreNosotros ──
    getData() { return this.getSection('about'); },
    saveData(data) { this.saveSection('about', data); this.closeCustomizer(); },
    resetData() { this.resetSection('about'); this.populateCustomizerForm(); },
    render() { this.renderAbout(); },
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

  // FAQ ACCORDION & SEARCH
  const FAQManager = {
    toggle(element) {
      const item = element.closest('.faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
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
      if (empty) empty.style.display = (visibleCount === 0 && q !== '') ? 'block' : 'none';
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

  // CONTACT FORM HANDLER
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

  // TRACKING ORDER LOOKUP
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
        <h4 style="margin:8px 0 4px;font-size:1.05rem;font-weight:700">Envío #${code}</h4>
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

  window.PagesManager = PagesManager;
  window.SobreNosotros = PagesManager;
  window.FAQManager = FAQManager;

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
