/**
 * CAPFIT - Gestor de Suscripciones y Planes (Mercado Pago Subscriptions)
 * Gestión multi-tenant de planes: FREE, STARTER, GROWTH, PRO, ENTERPRISE
 * Conversión fija acordada: 1 USD = $1.800 ARS
 *
 * Módulo para gestionar el estado de suscripción del usuario, calcular
 * planes en pesos argentinos, validar el nivel actual del usuario y
 * renderizar la interfaz de forma dinámica y reactiva.
 */

const SuscripcionManager = (() => {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════
  // 1. CONFIGURACIÓN Y CATÁLOGO BASE DE PLANES
  // ══════════════════════════════════════════════════════════════════════
  const TASA_CAMBIO_DEFAULT = 1800; // 1 USD = $1.800 ARS redondeado

  const NIVELES_JERARQUIA = {
    free: 0,
    starter: 1,
    growth: 2,
    pro: 3,
    enterprise: 4
  };

  const CATALOGO_BASE_PLANES = [
    {
      id: 'free',
      name: 'FREE',
      price_monthly_usd: 0,
      generations_per_month: 20,
      badge: 'Prueba Inicial',
      badgeColor: '#64748b',
      tagline: 'Ideal para probar el probador virtual con IA en tu tienda sin costo alguno.',
      popular: false,
      features: [
        '20 generaciones de IA por mes',
        'Probador virtual de gorras y accesorios',
        'Sin tarjeta de crédito requerida',
        'Catálogo de productos activo',
        'Activación inmediata'
      ]
    },
    {
      id: 'starter',
      name: 'STARTER',
      price_monthly_usd: 10,
      generations_per_month: 150,
      badge: 'Emprendedores',
      badgeColor: '#0284c7',
      tagline: 'Para tiendas en crecimiento que buscan aumentar su tasa de conversión online.',
      popular: false,
      features: [
        '150 generaciones de IA por mes',
        'Probador virtual interactivo HD',
        'Sin marca de agua CapFit en fotos',
        'Soporte estándar por correo y WhatsApp',
        'Cancelación con 1 clic en Mercado Pago'
      ]
    },
    {
      id: 'growth',
      name: 'GROWTH',
      price_monthly_usd: 20,
      generations_per_month: 400,
      badge: 'MÁS POPULAR',
      badgeColor: '#10b981',
      tagline: 'Nuestra opción más elegida: potencia tu marca con branding propio e integraciones.',
      popular: true,
      features: [
        '400 generaciones de IA por mes',
        'Personalización de colores y marca',
        'Panel de métricas y conversiones',
        'Integración con catálogo TiendaNube',
        'Soporte prioritario por WhatsApp'
      ]
    },
    {
      id: 'pro',
      name: 'PRO',
      price_monthly_usd: 50,
      generations_per_month: 1500,
      badge: 'Marcas Líderes',
      badgeColor: '#8b5cf6',
      tagline: 'Alto volumen y herramientas avanzadas para marcas y tiendas consolidadas.',
      popular: false,
      features: [
        '1.500 generaciones de IA por mes',
        'Marca de agua personalizada de tu marca',
        'Analytics avanzado de engagement con IA',
        'Acceso a API de probador y webhooks',
        'Soporte técnico preferencial 24/7'
      ]
    },
    {
      id: 'enterprise',
      name: 'ENTERPRISE',
      price_monthly_usd: 200,
      generations_per_month: 6000,
      badge: 'Gran Escala',
      badgeColor: '#0f172a',
      tagline: 'Infraestructura dedicada, máxima prioridad y acuerdos de nivel de servicio (SLA).',
      popular: false,
      features: [
        '6.000 generaciones de IA por mes',
        'Generaciones adicionales a tarifa mayorista',
        'Account Manager asignado para tu tienda',
        'Integraciones a medida y soporte de ingeniería',
        'SLA 99.9% de disponibilidad garantizada'
      ]
    }
  ];

  // ══════════════════════════════════════════════════════════════════════
  // 2. ESTADO INTERNO REACTIVO
  // ══════════════════════════════════════════════════════════════════════
  let _estado = {
    cargando: false,
    error: null,
    storeId: 'principal',
    storeData: null,
    planActualId: 'free',
    nivelActual: 0,
    cuota: {
      used: 0,
      limit: 20,
      remaining: 20,
      percentage: 0,
      period: ''
    },
    tasaCambioARS: TASA_CAMBIO_DEFAULT,
    planes: []
  };

  const _subscriptores = [];

  function notificarSubscriptores() {
    _subscriptores.forEach(fn => {
      try {
        fn({ ..._estado });
      } catch (err) {
        console.error('[Suscripcion] Error en subscriptor:', err);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. FUNCIONES DE CÁLCULO DE PLANES EN PESOS ARGENTINOS (ARS)
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Calcula el precio en pesos argentinos según el valor en USD y la tasa acordada.
   * @param {number} precioUSD
   * @param {number} [tasa=1800]
   * @returns {number} Monto en ARS
   */
  function calcularPrecioEnPesos(precioUSD, tasa = _estado.tasaCambioARS || TASA_CAMBIO_DEFAULT) {
    if (!precioUSD || precioUSD <= 0) return 0;
    return Math.round(Number(precioUSD) * Number(tasa));
  }

  /**
   * Formatea un número en formato moneda de pesos argentinos: "$18.000".
   * @param {number} monto
   * @returns {string}
   */
  function formatearMonedaARS(monto) {
    const num = Number(monto || 0);
    if (num === 0) return '$0';
    return '$' + num.toLocaleString('es-AR');
  }

  /**
   * Genera el catálogo completo de planes recalculados en pesos argentinos.
   * @param {number} [tasa] Tasa de cambio opcional (default 1800)
   * @returns {Array} Lista de planes con precios en ARS y USD
   */
  function calcularPlanesEnPesos(tasa = _estado.tasaCambioARS || TASA_CAMBIO_DEFAULT) {
    return CATALOGO_BASE_PLANES.map(plan => {
      const precioARS = calcularPrecioEnPesos(plan.price_monthly_usd, tasa);
      return {
        ...plan,
        price_monthly_ars: precioARS,
        price_formatted_ars: precioARS === 0 ? 'Gratis' : formatearMonedaARS(precioARS),
        price_formatted_usd: `US$ ${plan.price_monthly_usd}`,
        exchange_rate: tasa,
        tierLevel: NIVELES_JERARQUIA[plan.id] ?? 0
      };
    });
  }

  /**
   * Obtiene los planes calculados actuales.
   */
  function obtenerPlanesCalculados() {
    if (!_estado.planes || _estado.planes.length === 0) {
      _estado.planes = calcularPlanesEnPesos(_estado.tasaCambioARS);
    }
    return _estado.planes;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. FUNCIONES DE VALIDACIÓN DEL NIVEL ACTUAL DEL USUARIO
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Retorna el nivel jerárquico numérico de un plan.
   * free = 0, starter = 1, growth = 2, pro = 3, enterprise = 4.
   * @param {string} planId
   * @returns {number}
   */
  function obtenerNivelUsuario(planId) {
    const cleanId = String(planId || 'free').toLowerCase();
    return NIVELES_JERARQUIA[cleanId] ?? 0;
  }

  /**
   * Valida la relación entre el plan actual del usuario y un plan destino.
   * @param {string} targetPlanId
   * @returns {Object} Validación completa de jerarquía y estado
   */
  function validarNivelUsuario(targetPlanId) {
    const currentId = String(_estado.planActualId || 'free').toLowerCase();
    const targetId = String(targetPlanId || 'free').toLowerCase();

    const currentLevel = obtenerNivelUsuario(currentId);
    const targetLevel = obtenerNivelUsuario(targetId);

    const isCurrent = currentId === targetId;
    const isUpgrade = targetLevel > currentLevel;
    const isDowngrade = targetLevel < currentLevel;

    let badgeStatus = '';
    let buttonLabel = '';
    let actionType = '';

    if (isCurrent) {
      badgeStatus = 'Tu Plan Actual';
      buttonLabel = '✓ Plan Actual Activo';
      actionType = 'current';
    } else if (isUpgrade) {
      badgeStatus = 'Mejorar Plan';
      buttonLabel = 'Mejorar a este Plan →';
      actionType = 'upgrade';
    } else {
      badgeStatus = 'Cambiar Plan';
      buttonLabel = 'Cambiar a este Plan';
      actionType = 'downgrade';
    }

    return {
      currentPlanId: currentId,
      targetPlanId: targetId,
      currentLevel,
      targetLevel,
      isCurrent,
      isUpgrade,
      isDowngrade,
      canUpgrade: isUpgrade,
      badgeStatus,
      buttonLabel,
      actionType
    };
  }

  /**
   * Verifica si un plan determinado es el que el usuario tiene activo actualmente.
   * @param {string} planId
   * @returns {boolean}
   */
  function esPlanActivo(planId) {
    return String(planId || '').toLowerCase() === String(_estado.planActualId || 'free').toLowerCase();
  }

  /**
   * Determina si el usuario puede mejorar (upgrade) a un plan superior.
   * @param {string} targetPlanId
   * @returns {boolean}
   */
  function puedeMejorarPlan(targetPlanId) {
    return obtenerNivelUsuario(targetPlanId) > obtenerNivelUsuario(_estado.planActualId);
  }

  /**
   * Obtiene el estado resumido del consumo de cuota mensual de IA.
   */
  function obtenerEstadoCuota() {
    const used = Number(_estado.cuota.used || 0);
    const limit = Number(_estado.cuota.limit || 20);
    const remaining = Math.max(0, limit - used);
    const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

    let status = 'ok'; // ok | warning | danger
    if (pct >= 100) status = 'danger';
    else if (pct >= 80) status = 'warning';

    return {
      used,
      limit,
      remaining,
      percentage: pct,
      status,
      isExhausted: used >= limit
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. GESTIÓN DEL ESTADO Y COMUNICACIÓN CON EL SERVIDOR
  // ══════════════════════════════════════════════════════════════════════

  function getActiveStoreId() {
    return sessionStorage.getItem('capfit_store_id') ||
      (window.Store && Store.getCurrentStoreId && !Store.getCurrentStoreId().startsWith('ais-') ? Store.getCurrentStoreId() : 'principal');
  }

  function getSubscriptionAuthHeaders(extra = {}) {
    const headers = { ...extra };
    const token = sessionStorage.getItem('capfit_admin_auth_token') || sessionStorage.getItem('capfit_session');
    if (token && token.includes('.')) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Retorna una copia inmutable del estado actual.
   */
  function obtenerEstado() {
    return { ..._estado };
  }

  /**
   * Actualiza el estado y notifica a los oyentes.
   * @param {Object} parcial
   */
  function actualizarEstado(parcial) {
    _estado = { ..._estado, ...parcial };
    if (parcial.tasaCambioARS) {
      _estado.planes = calcularPlanesEnPesos(_estado.tasaCambioARS);
    }
    if (parcial.planActualId) {
      _estado.nivelActual = obtenerNivelUsuario(_estado.planActualId);
    }
    notificarSubscriptores();
  }

  /**
   * Registra un callback para cambios de estado.
   * @param {Function} callback
   * @returns {Function} Función para desuscribirse
   */
  function suscribir(callback) {
    if (typeof callback === 'function') {
      _subscriptores.push(callback);
      return () => {
        const index = _subscriptores.indexOf(callback);
        if (index > -1) _subscriptores.splice(index, 1);
      };
    }
    return () => {};
  }

  /**
   * Carga el estado de suscripción desde el backend para la tienda actual.
   */
  async function cargarEstadoSuscripcion() {
    _estado.cargando = true;
    _estado.error = null;

    const storeId = getActiveStoreId();
    _estado.storeId = storeId;
    _estado.planes = calcularPlanesEnPesos(_estado.tasaCambioARS);

    try {
      const res = await fetch(`/api/plans?store=${encodeURIComponent(storeId)}`);
      if (res.ok) {
        const data = await res.json();
        _estado.storeData = data;
        const currentPlan = (data.currentPlanId || (data.quota && data.quota.plan) || 'free').toLowerCase();
        _estado.planActualId = currentPlan;
        _estado.nivelActual = obtenerNivelUsuario(currentPlan);

        if (data.quota) {
          const used = Number(data.quota.used || 0);
          const limit = Number(data.quota.limit || 20);
          _estado.cuota = {
            used,
            limit,
            remaining: Math.max(0, limit - used),
            percentage: Math.min(100, Math.round((used / Math.max(1, limit)) * 100)),
            period: data.quota.period || ''
          };
        }
      }
    } catch (err) {
      console.warn('[Suscripcion] Nota al consultar estado del plan:', err.message);
      _estado.error = err.message;
    } finally {
      _estado.cargando = false;
      notificarSubscriptores();
    }

    return obtenerEstado();
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. RENDERIZADO DINÁMICO DE COMPONENTES
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Renderiza la tarjeta individual de un plan con la plantilla y diseño estético.
   * @param {Object} plan
   * @param {Object} estado
   * @returns {string} HTML string
   */
  function renderizarTarjetaPlan(plan, estado) {
    const validacion = validarNivelUsuario(plan.id);
    const isCurrent = validacion.isCurrent;
    const isPopular = plan.popular;

    return `
      <div class="sub-plan-card ${isCurrent ? 'current-plan-card' : ''} ${isPopular ? 'popular-plan-card' : ''}" data-plan-id="${plan.id}">
        ${isPopular ? `<div class="sub-popular-ribbon">${plan.badge}</div>` : ''}

        <div class="sub-card-header">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <span class="sub-tier-tag" style="background:${plan.badgeColor}18;color:${plan.badgeColor};border:1px solid ${plan.badgeColor}38">
              ${plan.badge}
            </span>
            ${isCurrent ? `
              <span class="sub-active-badge">
                <span class="sub-dot-pulse"></span> Tu Plan Actual
              </span>
            ` : ''}
          </div>

          <h3 class="sub-plan-title">${plan.name}</h3>
          <p class="sub-plan-desc">${plan.tagline}</p>
        </div>

        <div class="sub-price-block">
          <div class="sub-price-main">
            <span class="sub-price-val">${plan.price_formatted_ars}</span>
            ${plan.price_monthly_ars > 0 ? `<span class="sub-price-period">/ mes</span>` : ''}
          </div>
          ${plan.price_monthly_ars === 0 ? `
            <div class="sub-usd-equiv">
              <strong>Sin costo mensual</strong> — Para siempre
            </div>
          ` : ''}
        </div>

        <div class="sub-quota-highlight">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#10b981;flex-shrink:0"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <div>
            <strong>${plan.generations_per_month.toLocaleString('es-AR')} fotos IA / mes</strong>
            <span>Probador virtual de alta fidelidad</span>
          </div>
        </div>

        <ul class="sub-features-list">
          ${plan.features.map(f => `
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>
              <span>${f}</span>
            </li>
          `).join('')}
        </ul>

        <div class="sub-card-action">
          ${isCurrent ? `
            <button type="button" class="sub-btn-current" disabled aria-label="Plan actualmente activo">
              ✓ Plan Actualmente Activo
            </button>
          ` : `
            <button
              type="button"
              class="sub-btn-subscribe ${isPopular ? 'btn-popular' : ''}"
              onclick="SuscripcionManager.handleSelectPlan('${plan.id}')"
            >
              <span>${validacion.isUpgrade ? 'Mejorar a este Plan' : 'Elegir Plan'}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          `}
        </div>
      </div>
    `;
  }

  /**
   * Renderiza el banner hero con la métrica de consumo de cuota mensual.
   * @param {Object} estado
   * @returns {string} HTML string
   */
  function renderizarBannerEstado(estado) {
    const planes = obtenerPlanesCalculados();
    const currentPlan = planes.find(p => p.id === estado.planActualId) || planes[0];
    const cuota = obtenerEstadoCuota();

    return `
      <div class="sub-usage-hero-card">
        <div class="sub-usage-left">
          <div class="sub-usage-badge">
            <span class="sub-dot-pulse"></span>
            <span>Plan Activo: <strong>${currentPlan.name}</strong></span>
          </div>
          <h2 class="sub-usage-title">Estado de tu Suscripción</h2>
          <p class="sub-usage-desc">
            Gestioná el consumo de generaciones de IA de tu tienda y escalá a un plan superior con débito automático de Mercado Pago cuando lo necesites.
          </p>

          <div class="sub-progress-wrap">
            <div class="sub-progress-bar-track">
              <div class="sub-progress-bar-fill ${cuota.status}" style="width: ${cuota.percentage}%"></div>
            </div>
            <div class="sub-progress-labels">
              <span>Consumiste <strong>${cuota.used}</strong> de tus <strong>${cuota.limit}</strong> fotos mensuales (${cuota.percentage}%)</span>
              <span><strong>${cuota.remaining}</strong> disponibles este mes</span>
            </div>
          </div>
        </div>

        <div class="sub-usage-stats-box">
          <div class="sub-stat-unit">
            <span class="sub-stat-num">${cuota.remaining}</span>
            <span class="sub-stat-lbl">Generaciones disponibles</span>
          </div>
          <div class="sub-stat-unit">
            <span class="sub-stat-num">${currentPlan.price_formatted_ars}</span>
            <span class="sub-stat-lbl">Costo mensual actual</span>
          </div>
          <div class="sub-stat-unit">
            <span class="sub-stat-num">${currentPlan.id === 'free' ? 'Plan Gratuito' : 'Débito MP'}</span>
            <span class="sub-stat-lbl">Cobro automático mensual</span>
          </div>
        </div>

        ${currentPlan.id !== 'free' ? `
          <div style="width:100%;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="display:flex;align-items:center;gap:8px;font-size:0.8rem;color:#cbd5e1">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" style="width:16px;height:16px"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              <span>Suscripción activa con débito automático de Mercado Pago</span>
            </div>
            <button
              type="button"
              onclick="SuscripcionManager.handleCancelSubscription()"
              style="background:none;border:1px solid rgba(239,68,68,0.5);color:#fca5a5;padding:6px 14px;border-radius:8px;font-size:0.78rem;font-weight:600;cursor:pointer;transition:all 0.15s"
              onmouseover="this.style.background='rgba(239,68,68,0.2)';this.style.color='#ffffff';"
              onmouseout="this.style.background='none';this.style.color='#fca5a5';"
            >
              Cancelar suscripción mensual
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Renderiza la grilla de planes dinámicamente.
   * @param {HTMLElement|string} containerElement
   */
  function renderizarPlanes(containerElement) {
    const container = typeof containerElement === 'string' ? document.querySelector(containerElement) : containerElement;
    if (!container) return;

    const planes = obtenerPlanesCalculados();
    container.innerHTML = planes.map(p => renderizarTarjetaPlan(p, _estado)).join('');
  }

  /**
   * Renderiza la sección de Preguntas Frecuentes sobre el débito de Mercado Pago.
   * @returns {string} HTML string
   */
  function renderizarFaq() {
    return `
      <div class="sub-faq-section">
        <div class="sub-faq-header">
          <span class="badge-pill badge-calidad">Dudas frecuentes</span>
          <h3 style="font-size:1.4rem;font-weight:800;color:#0f172a;margin:8px 0 6px">Preguntas sobre el Débito de Mercado Pago</h3>
          <p style="font-size:0.9rem;color:#64748b">Conocé cómo funciona el servicio de suscripciones recurrentes y cómo cancelar en cualquier momento.</p>
        </div>

        <div class="sub-faq-grid">
          <div class="sub-faq-card">
            <h4>¿Cómo se realiza el cobro mensual?</h4>
            <p>Se realiza mediante el sistema nativo de <strong>Débito Automático (Preapproval) de Mercado Pago</strong>. Ingresás tu tarjeta una sola vez y se te debita de manera automática cada 30 días con certificación oficial y cifrado bancario.</p>
          </div>

          <div class="sub-faq-card">
            <h4>¿Puedo cambiar de plan o cancelar cuando quiera?</h4>
            <p>Sí, no hay ningún contrato de permanencia ni penalización. Podés mejorar tu plan cuando quieras o cancelarlo directamente desde este panel o desde tu propia aplicación de Mercado Pago.</p>
          </div>

          <div class="sub-faq-card">
            <h4>¿Qué sucede si consumo todas las fotos antes de fin de mes?</h4>
            <p>El probador virtual se pausa hasta el siguiente ciclo de facturación, o podés subir a un plan superior (ej. de Starter a Growth) en cualquier momento para habilitar inmediatamente el nuevo cupo.</p>
          </div>

          
        </div>
      </div>
    `;
  }

  /**
   * Abre la sección de suscripciones en una pestaña diferente del navegador.
   */
  function abrirEnNuevaPestana() {
    const url = window.location.origin + window.location.pathname + '#suscripcion';
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Renderiza la vista completa dentro de un contenedor dado.
   * @param {HTMLElement} container
   */
  async function renderInto(container) {
    if (!container) return;

    // Detectar retorno desde checkout de Mercado Pago (?status=approved o simulated)
    const rawSearch = window.location.search || (window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : '');
    const urlParams = new URLSearchParams(rawSearch);
    const mpStatus = urlParams.get('status');
    const returnedPlanId = urlParams.get('plan');
    const isSimulated = urlParams.get('simulated') === 'true';

    if (mpStatus === 'approved') {
      if (isSimulated && returnedPlanId) {
        try {
          await fetch('/api/subscriptions/simulate-approval', {
            method: 'POST',
            headers: getSubscriptionAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ storeId: getActiveStoreId(), planId: returnedPlanId })
          });
        } catch (e) {}
      }

      setTimeout(() => {
        if (window.showCustomModal) {
          window.showCustomModal({
            title: '¡Suscripción Confirmada!',
            message: 'Tu suscripción con débito automático de Mercado Pago ha sido confirmada y activada con éxito.\n\nEl cupo mensual de fotos con IA ya está disponible en tu tienda.',
            icon: 'success',
            buttonText: '¡Comenzar a Usar!'
          });
        }
      }, 400);

      try {
        window.history.replaceState({}, document.title, window.location.pathname + '#suscripcion');
      } catch (e) {}
    }

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:#64748b;min-height:300px">
        <div class="spinner" style="width:34px;height:34px;border:3px solid #e2e8f0;border-top-color:#0f172a;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:14px"></div>
        <span style="font-size:0.92rem;font-weight:500">Cargando planes y suscripciones...</span>
      </div>
    `;

    await cargarEstadoSuscripcion();
    const planes = obtenerPlanesCalculados();

    container.innerHTML = `
      <div class="suscripcion-wrapper">
        <!-- Usage & Status Hero Banner -->
        ${renderizarBannerEstado(_estado)}

        <!-- Plans Grid -->
        <div class="sub-section-title-wrap">
          <h2 class="sub-section-title">Elegí el Plan que mejor se adapte a tu Tienda</h2>
          <p class="sub-section-sub">
            Todos los planes incluyen probador virtual interactivo con IA, soporte y actualizaciones continuas.
          </p>
        </div>

        <div class="sub-plans-grid" id="suscripcion-grid-container">
          ${planes.map(p => renderizarTarjetaPlan(p, _estado)).join('')}
        </div>

        <!-- FAQ Section -->
        ${renderizarFaq()}
      </div>
    `;
  }

  /**
   * Renderiza dentro de la vista por defecto (#suscripcion-content-area).
   */
  function render() {
    const container = document.getElementById('suscripcion-content-area');
    if (container) {
      renderInto(container);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 7. MODAL DE CONFIRMACIÓN Y CHECKOUT CON MERCADO PAGO
  // ══════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════
  // 7. MODAL POPUP DE MERCADO PAGO CON BOTÓN X PARA SALIR / CANCELAR
  // ══════════════════════════════════════════════════════════════════════
  function openMercadoPagoSubscriptionPopup({ plan, initPoint, storeId }) {
    const existing = document.getElementById('mp-sub-checkout-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mp-sub-checkout-modal';
    modal.className = 'mp-modal-backdrop';
    modal.style.zIndex = '100000';

    if (initPoint) {
      modal.innerHTML = `
        <div class="mp-modal-card" style="max-width:680px;width:100%;max-height:94vh;height:820px;display:flex;flex-direction:column;border-radius:24px;overflow:hidden;box-shadow:0 25px 60px -15px rgba(0,0,0,0.5);background:#ffffff;">
          <!-- Barra superior con botón X destacado -->
          <div class="mp-header-top" style="flex-shrink:0;background:#ffffff;border-bottom:1px solid #e2e8f0;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:34px;height:34px;border-radius:8px;background:#009ee3;display:flex;align-items:center;justify-content:center;color:#ffffff;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              </div>
              <div>
                <strong style="display:block;font-size:0.95rem;color:#0f172a;line-height:1.2;">Mercado Pago — Suscripción ${plan.name}</strong>
                <span style="font-size:0.75rem;color:#64748b;">${plan.price_formatted_ars} / mes • Débito automático recurrente</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button type="button" id="mp-sub-exit-btn" class="admin-btn-outline" style="padding:6px 14px;font-size:0.8rem;border-radius:8px;color:#dc2626;border-color:#fecaca;background:#fff5f5;display:inline-flex;align-items:center;gap:4px;cursor:pointer;">
                <span>✕ Salir</span>
              </button>
              <button type="button" id="mp-sub-close-btn" class="mp-close-btn" title="Cerrar y cancelar (✕)" style="font-size:1.4rem;width:34px;height:34px;cursor:pointer;">&times;</button>
            </div>
          </div>

          <!-- Barra de aviso y opción de ventana emergente -->
          <div style="background:#f8fafc;padding:8px 20px;font-size:0.78rem;color:#475569;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" style="width:14px;height:14px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Conexión protegida por Mercado Pago. Podés cancelar con la <strong>✕</strong> en cualquier momento.
            </span>
            <button type="button" id="mp-sub-open-popup-window" style="background:none;border:none;color:#009ee3;font-size:0.78rem;font-weight:600;cursor:pointer;text-decoration:underline;">
              Abrir en ventana emergente ↗
            </button>
          </div>

          <!-- Iframe con el checkout oficial de Mercado Pago -->
          <div style="flex:1;position:relative;background:#ffffff;min-height:460px;overflow:hidden;">
            <div id="mp-sub-loading" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#ffffff;z-index:1;gap:12px;color:#64748b;">
              <div class="spinner" style="width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#009ee3;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
              <span style="font-size:0.85rem;">Cargando pasarela oficial de Mercado Pago...</span>
            </div>
            <iframe id="mp-sub-iframe" src="${initPoint}" style="width:100%;height:100%;border:none;" allow="payment; clipboard-read; clipboard-write"></iframe>
          </div>

          <!-- Pie con botón de cancelar y de verificación -->
          <div style="padding:12px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
            <button type="button" id="mp-sub-cancel-footer" class="admin-btn-outline" style="padding:8px 16px;font-size:0.85rem;color:#64748b;cursor:pointer;">
              ✕ Cancelar y Volver a Mi Tienda
            </button>
            <button type="button" id="mp-sub-verify-footer" class="admin-btn-primary" style="padding:8px 18px;font-size:0.85rem;background:#059669;border-color:#059669;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
              <span>✓ Ya completé la suscripción (Actualizar)</span>
            </button>
          </div>
        </div>
      `;
    } else {
      modal.innerHTML = `
        <div class="mp-modal-card" style="max-width:480px;width:100%;border-radius:24px;overflow:hidden;box-shadow:0 25px 60px -15px rgba(0,0,0,0.5);background:#ffffff;">
          <!-- Barra superior con botón X destacado -->
          <div class="mp-header-top" style="flex-shrink:0;background:#ffffff;border-bottom:1px solid #e2e8f0;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:34px;height:34px;border-radius:8px;background:#009ee3;display:flex;align-items:center;justify-content:center;color:#ffffff;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              </div>
              <div>
                <strong style="display:block;font-size:1rem;color:#0f172a;">Mercado Pago — Suscripción</strong>
                <span style="font-size:0.75rem;color:#64748b;">Plan ${plan.name} (${plan.price_formatted_ars} / mes)</span>
              </div>
            </div>
            <button type="button" id="mp-sub-close-btn" class="mp-close-btn" title="Cerrar y cancelar (✕)" style="font-size:1.4rem;width:34px;height:34px;cursor:pointer;">&times;</button>
          </div>

          <div style="padding:24px 20px;max-height:80vh;overflow-y:auto;" id="mp-sub-form-container">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px 14px;margin-bottom:18px;display:flex;align-items:center;gap:10px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" style="width:20px;height:20px;flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <div style="font-size:0.82rem;color:#166534;">
                <strong>Débito recurrente seguro:</strong> Vas a suscribirte al Plan ${plan.name} por ${plan.price_formatted_ars}/mes con ${plan.generations_per_month.toLocaleString('es-AR')} fotos IA.
              </div>
            </div>

            <!-- Campos de tarjeta de crédito/débito -->
            <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:20px;">
              <div>
                <label style="display:block;font-size:0.78rem;font-weight:600;color:#475569;margin-bottom:4px;">Número de Tarjeta</label>
                <div style="position:relative;">
                  <input type="text" id="mp-sub-card-num" placeholder="•••• •••• •••• 4242" value="4509 3829 1092 8492" maxlength="19" class="admin-input" style="width:100%;padding:10px 12px;font-size:0.9rem;border-radius:8px;border:1px solid #cbd5e1;background:#fff;">
                  <span style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:0.75rem;font-weight:bold;color:#009ee3;">VISA</span>
                </div>
              </div>

              <div>
                <label style="display:block;font-size:0.78rem;font-weight:600;color:#475569;margin-bottom:4px;">Titular de la Tarjeta</label>
                <input type="text" id="mp-sub-card-holder" placeholder="Nombre como figura en la tarjeta" value="Lucas Guerrero" class="admin-input" style="width:100%;padding:10px 12px;font-size:0.9rem;border-radius:8px;border:1px solid #cbd5e1;background:#fff;">
              </div>

              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                  <label style="display:block;font-size:0.78rem;font-weight:600;color:#475569;margin-bottom:4px;">Vencimiento</label>
                  <input type="text" id="mp-sub-card-exp" placeholder="MM/AA" value="12/28" maxlength="5" class="admin-input" style="width:100%;padding:10px 12px;font-size:0.9rem;border-radius:8px;border:1px solid #cbd5e1;background:#fff;">
                </div>
                <div>
                  <label style="display:block;font-size:0.78rem;font-weight:600;color:#475569;margin-bottom:4px;">Cód. Seguridad (CVC)</label>
                  <input type="password" id="mp-sub-card-cvc" placeholder="•••" value="123" maxlength="4" class="admin-input" style="width:100%;padding:10px 12px;font-size:0.9rem;border-radius:8px;border:1px solid #cbd5e1;background:#fff;">
                </div>
              </div>
            </div>

            <!-- Acciones -->
            <div style="display:flex;flex-direction:column;gap:10px;">
              <button type="button" id="mp-sub-submit-btn" class="admin-btn-primary" style="width:100%;padding:14px;font-size:0.95rem;background:#009ee3;border-color:#009ee3;border-radius:10px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(0, 158, 227, 0.35);cursor:pointer;">
                <span>Confirmar Débito Automático con Mercado Pago</span>
              </button>

              <button type="button" id="mp-sub-cancel-footer" class="admin-btn-outline" style="width:100%;padding:11px;font-size:0.85rem;border-radius:10px;color:#64748b;border-color:#cbd5e1;cursor:pointer;">
                ✕ Cancelar y Volver sin Cambios
              </button>
            </div>

            <div style="margin-top:14px;text-align:center;font-size:0.72rem;color:#94a3b8;display:flex;align-items:center;justify-content:center;gap:6px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Transacción protegida por cifrado SSL de 256 bits
            </div>
          </div>
        </div>
      `;
    }

    document.body.appendChild(modal);

    const closeSubModal = () => {
      modal.remove();
      if (window.showToast) {
        window.showToast('Operación cancelada. No se realizó ningún cargo.');
      }
    };

    // Botones de cierre (X y Salir)
    const closeBtn = modal.querySelector('#mp-sub-close-btn');
    if (closeBtn) closeBtn.onclick = closeSubModal;

    const exitBtn = modal.querySelector('#mp-sub-exit-btn');
    if (exitBtn) exitBtn.onclick = closeSubModal;

    const cancelFooter = modal.querySelector('#mp-sub-cancel-footer');
    if (cancelFooter) cancelFooter.onclick = closeSubModal;

    // Cierre al hacer click en el fondo oscuro exterior
    modal.onclick = (e) => {
      if (e.target === modal) closeSubModal();
    };

    // Cierre con la tecla ESC
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKeyDown);
        closeSubModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Iframe loading
    const iframe = modal.querySelector('#mp-sub-iframe');
    const loading = modal.querySelector('#mp-sub-loading');
    if (iframe && loading) {
      iframe.onload = () => {
        loading.style.display = 'none';
      };
      setTimeout(() => {
        if (loading) loading.style.display = 'none';
      }, 3500);
    }

    // Botón abrir en ventana emergente popup si el usuario lo prefiere
    const openPopupBtn = modal.querySelector('#mp-sub-open-popup-window');
    if (openPopupBtn && initPoint) {
      openPopupBtn.onclick = () => {
        window.open(initPoint, 'mp_sub_checkout', 'width=780,height=800,menubar=no,toolbar=no,status=no');
      };
    }

    // Botón verificar estado de suscripción real con el servidor (sin invocar simulate-approval en flujos de pasarela)
    const verifyBtn = modal.querySelector('#mp-sub-verify-footer');
    if (verifyBtn) {
      verifyBtn.onclick = async () => {
        verifyBtn.disabled = true;
        verifyBtn.innerHTML = `<span>⏳ Verificando estado con Mercado Pago...</span>`;

        await cargarEstadoSuscripcion();
        modal.remove();
        render();

        if (_estado.planActualId === plan.id && _estado.estadoSuscripcion === 'active') {
          if (window.showCustomModal) {
            window.showCustomModal({
              title: '¡Suscripción Activada!',
              message: `Tu tienda ahora cuenta con el Plan ${plan.name} (${plan.generations_per_month.toLocaleString('es-AR')} fotos IA/mes).`,
              icon: 'success',
              buttonText: '¡Excelente!'
            });
          }
        } else if (window.showToast) {
          window.showToast('Estado de suscripción actualizado. Si acabás de pagar, Mercado Pago confirmará el alta en unos instantes.');
        }
      };
    }

    // Botón confirmar suscripción en tarjeta directa (modo simulación en desarrollo)
    const submitBtn = modal.querySelector('#mp-sub-submit-btn');
    if (submitBtn) {
      submitBtn.onclick = async () => {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <div class="spinner" style="width:18px;height:18px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block;"></div>
          <span>Procesando suscripción con Mercado Pago...</span>
        `;

        try {
          const res = await fetch('/api/subscriptions/simulate-approval', {
            method: 'POST',
            headers: getSubscriptionAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ storeId: storeId, planId: plan.id })
          });
          const resData = await res.json();

          if (resData.ok) {
            const formContainer = modal.querySelector('#mp-sub-form-container');
            if (formContainer) {
              formContainer.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 10px;text-align:center;">
                  <div style="width:60px;height:60px;border-radius:50%;background:#ecfdf5;color:#059669;display:flex;align-items:center;justify-content:center;margin-bottom:16px;box-shadow:0 10px 25px -5px rgba(16,185,129,0.3);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:30px;height:30px;"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3 style="font-size:1.25rem;font-weight:700;color:#0f172a;margin-bottom:6px;">¡Suscripción Confirmada!</h3>
                  <p style="font-size:0.88rem;color:#475569;margin-bottom:20px;max-width:320px;">
                    Tu tienda ha sido actualizada con éxito al <strong>Plan ${plan.name}</strong> con ${plan.generations_per_month.toLocaleString('es-AR')} fotos de IA mensuales.
                  </p>
                  <button type="button" id="mp-sub-success-done" class="admin-btn-primary" style="padding:10px 24px;border-radius:10px;background:#059669;border-color:#059669;font-weight:600;cursor:pointer;">
                    Ir a Mi Tienda
                  </button>
                </div>
              `;
              const doneBtn = formContainer.querySelector('#mp-sub-success-done');
              if (doneBtn) {
                doneBtn.onclick = async () => {
                  modal.remove();
                  await cargarEstadoSuscripcion();
                  render();
                };
              }
            }

            setTimeout(async () => {
              if (modal && modal.parentNode) {
                modal.remove();
                await cargarEstadoSuscripcion();
                render();
              }
            }, 3000);
          } else {
            throw new Error(resData.error || 'No se pudo procesar la suscripción');
          }
        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Reintentar Suscripción</span>`;
          alert('Error al procesar: ' + err.message);
        }
      };
    }
  }

  function handleSelectPlan(planId) {
    const planes = obtenerPlanesCalculados();
    const plan = planes.find(p => p.id === planId);
    if (!plan) return;

    const existing = document.getElementById('sub-confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'sub-confirm-modal';
    modal.className = 'mp-modal-backdrop';
    modal.style.zIndex = '10000';

    modal.innerHTML = `
      <div class="custom-modal-card" style="
        background:#ffffff;
        border-radius:24px;
        padding:28px 24px;
        width:100%;
        max-width:440px;
        box-shadow:0 25px 50px -12px rgba(15, 23, 42, 0.35);
        border:1px solid #f1f5f9;
        text-align:left;
        animation: mpSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e2e8f0">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:38px;height:38px;border-radius:10px;background:#ecfdf5;display:flex;align-items:center;justify-content:center;color:#059669">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
            <div>
              <strong style="display:block;font-size:1.05rem;color:#0f172a">Suscripción ${plan.name}</strong>
              <span style="font-size:0.78rem;color:#64748b">Débito automático con Mercado Pago</span>
            </div>
          </div>
          <button type="button" id="sub-modal-close-x" class="mp-close-btn" title="Cerrar y cancelar (✕)" style="font-size:1.4rem;cursor:pointer;">&times;</button>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:18px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
            <span style="font-size:0.85rem;color:#64748b">Monto mensual:</span>
            <strong style="font-size:1.35rem;color:#0f172a">${plan.price_formatted_ars} <small style="font-size:0.8rem;font-weight:400;color:#64748b">/ mes</small></strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.82rem;color:#64748b">
            <span>Cupo de IA incluido:</span>
            <strong style="color:#059669">${plan.generations_per_month.toLocaleString('es-AR')} fotos / mes</strong>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;font-size:0.82rem;color:#475569;margin-bottom:20px">
          <div style="display:flex;align-items:flex-start;gap:8px">
            <span style="color:#10b981;font-weight:bold">✓</span>
            <span>Débito automático mensual en tu tarjeta de crédito/débito.</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px">
            <span style="color:#10b981;font-weight:bold">✓</span>
            <span>Sin contratos forzosos. Cancelás con 1 clic en cualquier momento.</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:8px">
            <span style="color:#10b981;font-weight:bold">✓</span>
            <span>Cobro 100% procesado bajo la seguridad cifrada de Mercado Pago.</span>
          </div>
        </div>

        <div style="display:flex;gap:10px">
          <button type="button" id="sub-modal-btn-cancel" class="admin-btn-outline" style="flex:1;padding:12px;font-size:0.88rem;cursor:pointer;">
            ✕ Cancelar
          </button>
          <button type="button" id="sub-modal-btn-confirm" class="admin-btn-primary" style="flex:2;padding:12px;font-size:0.88rem;background:#009ee3;border-color:#009ee3;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
            <span>Suscribirme con Mercado Pago</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#sub-modal-close-x').onclick = closeModal;
    modal.querySelector('#sub-modal-btn-cancel').onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    modal.querySelector('#sub-modal-btn-confirm').onclick = async () => {
      const confirmBtn = modal.querySelector('#sub-modal-btn-confirm');
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span>⏳ Conectando con Mercado Pago...</span>`;

      try {
        const storeId = getActiveStoreId();
        const res = await fetch('/api/subscriptions/create-preapproval', {
          method: 'POST',
          headers: getSubscriptionAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            planId: plan.id,
            storeId: storeId
          })
        });

        const data = await res.json();
        closeModal();

        if (!res.ok || !data.ok) {
          alert(data.error || 'Debes iniciar sesión como administrador de la tienda para gestionar la suscripción.');
          return;
        }

        // En lugar de redirigir toda la ventana (haciendo imposible salir), abrimos la ventana popup con la X para salir/cancelar
        openMercadoPagoSubscriptionPopup({
          plan,
          initPoint: (data.ok && data.init_point && !data.simulated) ? data.init_point : null,
          storeId
        });
      } catch (err) {
        closeModal();
        alert('Error al iniciar suscripción: ' + err.message);
      }
    };
  }

  /**
   * Cancela la suscripción activa con Mercado Pago y degrada la tienda a FREE
   */
  async function handleCancelSubscription() {
    if (!confirm('¿Estás seguro de que deseás cancelar tu suscripción recurrente de Mercado Pago?\n\nTu tienda continuará activa con el plan gratuito FREE (20 fotos con IA por mes).')) {
      return;
    }

    try {
      const storeId = getActiveStoreId();
      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: getSubscriptionAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ storeId })
      });
      const data = await res.json();
      if (data.ok) {
        if (window.showCustomModal) {
          window.showCustomModal({
            title: 'Suscripción Cancelada',
            message: 'Tu débito recurrente de Mercado Pago ha sido cancelado con éxito. Tu tienda continúa con el plan gratuito FREE (20 fotos/mes).',
            icon: 'info',
            buttonText: 'Entendido'
          });
        }
        await cargarEstadoSuscripcion();
        render();
      } else {
        alert(data.error || 'No se pudo cancelar la suscripción.');
      }
    } catch (err) {
      alert('Error de conexión: ' + err.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 8. EXPOSICIÓN DE LA API PÚBLICA
  // ══════════════════════════════════════════════════════════════════════
  return {
    // Cálculo de planes en pesos
    calcularPrecioEnPesos,
    calcularPlanesEnPesos,
    formatearMonedaARS,
    obtenerPlanesCalculados,
    getPlans: obtenerPlanesCalculados,
    obtenerPlanes: obtenerPlanesCalculados,

    // Validación de niveles
    obtenerNivelUsuario,
    validarNivelUsuario,
    esPlanActivo,
    puedeMejorarPlan,
    obtenerEstadoCuota,

    // Gestión del estado
    obtenerEstado,
    actualizarEstado,
    cargarEstadoSuscripcion,
    suscribir,

    // Renderizado
    renderizarPlanes,
    renderizarTarjetaPlan,
    renderizarBannerEstado,
    renderizarFaq,
    renderInto,
    render,

    // Navegación en nueva pestaña
    abrirEnNuevaPestana,

    // Acciones de usuario y Mercado Pago
    handleSelectPlan,
    handleCancelSubscription,
    openMercadoPagoSubscriptionPopup
  };
})();

window.SuscripcionManager = SuscripcionManager;
