/**
 * CAPFIT Multi-Tenant SaaS Store Manager
 * 100% Cloud Persistence powered by Firebase Firestore.
 * No local disk JSON dependency.
 */

let FirebaseDb = null;
try {
  FirebaseDb = require('./firebase-db');
} catch (e) {
  console.warn('Firebase DB no disponible en StoreManager:', e.message);
}

// In-Memory Cloud-Synced Cache for instantaneous response and high performance
let cachedStores = [];
const cachedProducts = new Map(); // storeId -> Array of products
const cachedOrders = new Map();   // storeId -> Array of orders
let isInitialized = false;
let initPromise = null;

function getCurrentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Cargar todos los datos de las tiendas, productos y órdenes directamente desde Firebase Firestore
 */
function init() {
  if (!initPromise) {
    initPromise = _doInit();
  }
  return initPromise;
}

function ensureInitialized() {
  if (isInitialized) return Promise.resolve();
  return init();
}

async function _doInit() {
  try {
    if (!FirebaseDb) {
      console.warn('⚠️ FirebaseDb no disponible, usando memoria volatil.');
      return;
    }

    await FirebaseDb.testConnection();
    console.log('🔄 Sincronizando catálogo y tiendas directamente desde Firebase Firestore...');

    // 1. Cargar todas las tiendas desde Firestore (/stores)
    const dbStores = await FirebaseDb.getStores();
    if (Array.isArray(dbStores) && dbStores.length > 0) {
      cachedStores = dbStores.map(st => ({
        id: st.id,
        subdomain: st.subdomain || st.id,
        fullDomain: st.fullDomain || `${st.subdomain || st.id}.capfit.store`,
        name: st.name || `Tienda ${st.id}`,
        tagline: st.tagline || '',
        username: st.username || st.adminUsername || `admin_${st.id}`,
        password: st.password || st.adminPassword || 'capfit2026',
        ownerEmail: st.ownerEmail || `admin@${st.subdomain || st.id}.shop`,
        ownerUid: st.ownerUid || null,
        plan: st.plan || 'Starter',
        about: st.about || null,
        sections: st.sections || null,
        aiMonthlyLimit: st.aiMonthlyLimit !== undefined ? Number(st.aiMonthlyLimit) : 100,
        aiGenerationsUsed: st.aiGenerationsUsed !== undefined ? Number(st.aiGenerationsUsed) : 0,
        aiCurrentPeriod: st.aiPeriod || st.aiCurrentPeriod || getCurrentPeriod(),
        brandColor: st.brandColor || '#111111',
        createdAt: st.createdAt || new Date().toISOString(),
        active: st.active !== undefined ? Boolean(st.active) : true
      }));
      console.log(`✅ ${cachedStores.length} tiendas cargadas desde Firebase Firestore:`, cachedStores.map(s => s.id));
    } else {
      console.log('ℹ️ No se encontraron tiendas en Firestore. Creando tienda principal predeterminada en Firestore...');
      const defaultPrincipal = {
        id: 'principal',
        subdomain: 'capfit',
        fullDomain: 'capfit.store',
        name: 'CAPFIT Oficial',
        tagline: 'Gorras premium y probador virtual con IA',
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'capfit2026',
        ownerEmail: 'admin@capfit.shop',
        plan: 'Enterprise',
        aiMonthlyLimit: 100,
        aiGenerationsUsed: 12,
        aiCurrentPeriod: getCurrentPeriod(),
        brandColor: '#111111',
        createdAt: new Date().toISOString(),
        active: true
      };
      await FirebaseDb.saveStore(defaultPrincipal);
      cachedStores = [defaultPrincipal];
    }

    // 2. Cargar productos y órdenes para cada tienda desde Firestore
    for (const store of cachedStores) {
      const sId = store.id;
      // Cargar productos de /stores/{sId}/products y fallback /products
      try {
        const prods = await FirebaseDb.getProductsByStore(sId);
        cachedProducts.set(sId, Array.isArray(prods) ? prods : []);
      } catch (err) {
        console.warn(`Nota cargando productos de tienda ${sId} desde Firestore:`, err.message);
        cachedProducts.set(sId, []);
      }

      // Cargar órdenes de /orders
      try {
        const orders = await FirebaseDb.getOrdersByStore(sId);
        cachedOrders.set(sId, Array.isArray(orders) ? orders : []);
      } catch (err) {
        console.warn(`Nota cargando órdenes de tienda ${sId} desde Firestore:`, err.message);
        cachedOrders.set(sId, []);
      }
    }

    isInitialized = true;
    console.log('🚀 Base de datos Firestore inicializada y activa como ÚNICA fuente de datos.');
  } catch (error) {
    console.error('Error al inicializar StoreManager con Firestore:', error);
  }
}

// Fallback sincronizado si init() aún no completó
function getAllStores() {
  if (cachedStores.length === 0) {
    // Tiendas base en memoria hasta que cargue la promesa de Firestore
    return [
      {
        id: 'principal',
        subdomain: 'capfit',
        fullDomain: 'capfit.shop',
        name: 'CAPFIT Oficial',
        tagline: 'Gorras premium y probador virtual con IA',
        username: 'admin',
        password: process.env.ADMIN_PASSWORD || 'capfit2026',
        ownerEmail: 'admin@capfit.shop',
        plan: 'Enterprise',
        aiMonthlyLimit: 100,
        aiGenerationsUsed: 12,
        aiCurrentPeriod: getCurrentPeriod(),
        brandColor: '#111111',
        createdAt: new Date().toISOString(),
        active: true
      }
    ];
  }
  return cachedStores;
}

function getStoreById(id) {
  const stores = getAllStores();
  return stores.find(s => s.id === id || s.subdomain === id) || null;
}

function getStoreBySubdomain(subdomain) {
  const stores = getAllStores();
  const clean = (subdomain || '').toLowerCase().trim();
  return stores.find(s => s.subdomain.toLowerCase() === clean) || null;
}

function resolveStoreFromRequest(req) {
  const host = (req.headers.host || '').toLowerCase();

  // 1. Headers explícitos
  const headerStore = req.headers['x-store-id'] || req.headers['x-store-subdomain'];
  if (headerStore) {
    const s = getStoreById(headerStore) || getStoreBySubdomain(headerStore);
    if (s) return s;
  }

  // 2. Query string (?store=tienda1 o ?tienda=tienda1)
  try {
    const urlObj = new URL(req.url, `http://${host || 'localhost'}`);
    const qsStore = urlObj.searchParams.get('store') || urlObj.searchParams.get('tienda');
    if (qsStore) {
      const s = getStoreById(qsStore) || getStoreBySubdomain(qsStore);
      if (s) return s;
    }
  } catch (_) {}

  // 3. Subdominio en Host header
  const hostWithoutPort = host.split(':')[0];
  const parts = hostWithoutPort.split('.');
  if (parts.length >= 2) {
    const sub = parts[0];
    if (sub === 'account') {
      return {
        id: 'account_portal',
        subdomain: 'account',
        fullDomain: 'account.capfit.store',
        name: 'Portal Dueños de Tienda CAPFIT',
        tagline: 'Gestión y Backoffice para Socios',
        isAccountPortal: true,
        active: true
      };
    }
    if (parts.length >= 3 && sub !== 'www' && sub !== 'api' && sub !== 'ais-dev' && sub !== 'ais-pre') {
      const s = getStoreBySubdomain(sub);
      if (s) return s;
    }
  }

  // Fallback: tienda principal CAPFIT
  return getStoreById('principal') || getAllStores()[0];
}

function saveStores(stores) {
  cachedStores = stores;
  if (FirebaseDb && typeof FirebaseDb.saveStore === 'function') {
    stores.forEach(st => {
      FirebaseDb.saveStore({
        id: st.id,
        subdomain: st.subdomain,
        fullDomain: st.fullDomain || `${st.subdomain}.capfit.store`,
        name: st.name,
        tagline: st.tagline || '',
        username: st.username,
        password: st.password,
        ownerEmail: st.ownerEmail || '',
        ownerUid: st.ownerUid || null,
        plan: st.plan || 'Starter',
        about: st.about !== undefined ? st.about : null,
        sections: st.sections !== undefined ? st.sections : null,
        aiMonthlyLimit: st.aiMonthlyLimit !== undefined ? Number(st.aiMonthlyLimit) : 100,
        aiGenerationsUsed: st.aiGenerationsUsed !== undefined ? Number(st.aiGenerationsUsed) : 0,
        aiPeriod: st.aiCurrentPeriod || getCurrentPeriod(),
        brandColor: st.brandColor || '#111111',
        active: Boolean(st.active),
        createdAt: st.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).catch(err => console.warn('Firestore store sync note:', err.message));
    });
  }
}

// ── PRODUCTOS (DIRECTO A FIRESTORE) ──

function readStoreProducts(storeId) {
  const sId = storeId || 'principal';
  return cachedProducts.get(sId) || [];
}

async function fetchStoreProductsFromDb(storeId) {
  const sId = storeId || 'principal';
  if (FirebaseDb && typeof FirebaseDb.getProductsByStore === 'function') {
    try {
      const prods = await FirebaseDb.getProductsByStore(sId);
      cachedProducts.set(sId, prods);
      return prods;
    } catch (e) {
      console.warn(`Error refrescando productos de ${sId} desde Firestore:`, e.message);
    }
  }
  return readStoreProducts(sId);
}

function writeStoreProducts(storeId, products) {
  const sId = storeId || 'principal';
  cachedProducts.set(sId, products);

  if (FirebaseDb && typeof FirebaseDb.saveProduct === 'function') {
    products.forEach(p => {
      FirebaseDb.saveProduct({
        ...p,
        id: String(p.id),
        storeId: sId
      }, sId).catch(err => console.warn(`Firestore save product error (${sId}/${p.id}):`, err.message));
    });
  }
}

function deleteStoreProduct(storeId, productId) {
  const sId = storeId || 'principal';
  let products = readStoreProducts(sId);
  const initialLen = products.length;
  products = products.filter(p => String(p.id) !== String(productId));
  cachedProducts.set(sId, products);

  if (FirebaseDb && typeof FirebaseDb.deleteProduct === 'function') {
    FirebaseDb.deleteProduct(productId, sId).catch(err => console.warn(`Firestore delete product error (${sId}/${productId}):`, err.message));
  }
  return products.length !== initialLen;
}

function syncStoreProductsToFirestore(storeId) {
  const sId = storeId || 'principal';
  const products = readStoreProducts(sId);
  if (FirebaseDb && typeof FirebaseDb.syncAllStoreProducts === 'function') {
    return FirebaseDb.syncAllStoreProducts(sId, products);
  }
  return Promise.resolve({ ok: true, count: products.length });
}

// ── ÓRDENES (DIRECTO A FIRESTORE) ──

function readStoreOrders(storeId) {
  const sId = storeId || 'principal';
  return cachedOrders.get(sId) || [];
}

async function fetchStoreOrdersFromDb(storeId) {
  const sId = storeId || 'principal';
  if (FirebaseDb && typeof FirebaseDb.getOrdersByStore === 'function') {
    try {
      const orders = await FirebaseDb.getOrdersByStore(sId);
      cachedOrders.set(sId, orders);
      return orders;
    } catch (e) {
      console.warn(`Error refrescando órdenes de ${sId} desde Firestore:`, e.message);
    }
  }
  return readStoreOrders(sId);
}

function writeStoreOrders(storeId, orders) {
  const sId = storeId || 'principal';
  cachedOrders.set(sId, orders);

  if (FirebaseDb && typeof FirebaseDb.saveOrder === 'function') {
    orders.forEach(o => {
      FirebaseDb.saveOrder({
        id: String(o.id),
        storeId: sId,
        customer: o.customer || {},
        items: Array.isArray(o.items) ? o.items : [],
        total: Number(o.total) || 0,
        subtotal: Number(o.subtotal) || 0,
        shippingCost: Number(o.shipping) || 0,
        status: o.shippingStatus || o.status || 'Por preparar',
        paymentStatus: o.paymentStatus || 'Aprobado',
        createdAt: o.date || o.createdAt || new Date().toISOString()
      }).catch(err => console.warn('Firestore order sync error:', err.message));
    });
  }
}

// ── CUOTA MENSUAL DE IA EN FIRESTORE ──

function checkAndDeductAiCredit(storeId) {
  const stores = getAllStores();
  const idx = stores.findIndex(s => s.id === storeId || s.subdomain === storeId);
  if (idx === -1) {
    return { ok: false, error: 'Tienda no registrada para consumo de IA' };
  }

  const store = stores[idx];
  const currentPeriod = getCurrentPeriod();

  if (store.aiCurrentPeriod !== currentPeriod) {
    store.aiCurrentPeriod = currentPeriod;
    store.aiGenerationsUsed = 0;
  }

  const limit = store.aiMonthlyLimit !== undefined ? Number(store.aiMonthlyLimit) : 100;
  const used = Number(store.aiGenerationsUsed) || 0;

  if (used >= limit) {
    saveStores(stores);
    return {
      ok: false,
      error: 'Límite mensual de pruebas con IA alcanzado',
      code: 'MONTHLY_AI_LIMIT_REACHED',
      storeName: store.name,
      subdomain: store.subdomain,
      used,
      limit,
      remaining: 0,
      period: currentPeriod,
      message: `La tienda "${store.name}" (${store.subdomain}.capfit.shop) ha alcanzado su límite mensual de ${limit} generaciones de IA (${used}/${limit}) para el período ${currentPeriod}. El cupo se reiniciará el próximo mes o podés ampliar el plan.`
    };
  }

  store.aiGenerationsUsed = used + 1;
  saveStores(stores);

  if (FirebaseDb && typeof FirebaseDb.logAITryOn === 'function') {
    FirebaseDb.logAITryOn({
      storeId: store.id,
      storeName: store.name,
      subdomain: store.subdomain,
      period: currentPeriod,
      quotaUsed: store.aiGenerationsUsed,
      quotaLimit: limit,
      status: 'consumed'
    }).catch(err => console.warn('Firestore AI log note:', err.message));
  }

  return {
    ok: true,
    storeId: store.id,
    storeName: store.name,
    used: store.aiGenerationsUsed,
    limit,
    remaining: Math.max(0, limit - store.aiGenerationsUsed),
    period: currentPeriod
  };
}

function getAiQuotaStatus(storeId) {
  const stores = getAllStores();
  const store = stores.find(s => s.id === storeId || s.subdomain === storeId);
  if (!store) return null;

  const currentPeriod = getCurrentPeriod();
  let used = store.aiGenerationsUsed || 0;
  if (store.aiCurrentPeriod !== currentPeriod) {
    used = 0;
  }
  const limit = store.aiMonthlyLimit !== undefined ? Number(store.aiMonthlyLimit) : 100;

  return {
    storeId: store.id,
    storeName: store.name,
    subdomain: store.subdomain,
    fullDomain: `${store.subdomain}.capfit.store`,
    plan: store.plan || 'Starter',
    limit,
    used,
    remaining: Math.max(0, limit - used),
    period: currentPeriod,
    percentUsed: Math.min(100, Math.round((used / limit) * 100))
  };
}

// ── GESTIÓN DE TIENDAS (DIRECTO A FIRESTORE) ──

function createStore({ subdomain, name, username, password, plan, aiMonthlyLimit, ownerEmail, ownerUid, tagline, brandColor }) {
  const stores = getAllStores();
  const cleanSub = (subdomain || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');

  if (!cleanSub) throw new Error('El subdominio es obligatorio y debe ser alfanumérico.');
  if (stores.some(s => s.subdomain.toLowerCase() === cleanSub)) {
    throw new Error(`El subdominio "${cleanSub}.capfit.store" ya está registrado.`);
  }

  const cleanUser = (username || cleanSub).trim();
  if (stores.some(s => s.username.toLowerCase() === cleanUser.toLowerCase())) {
    throw new Error(`El usuario "${cleanUser}" ya existe.`);
  }

  const currentPeriod = getCurrentPeriod();
  const newStore = {
    id: cleanSub,
    subdomain: cleanSub,
    fullDomain: `${cleanSub}.capfit.store`,
    name: (name || `Tienda ${cleanSub}`).trim(),
    tagline: (tagline || 'Tienda de gorras personalizada').trim(),
    username: cleanUser,
    password: (password || '123456').trim(),
    ownerEmail: (ownerEmail || `contacto@${cleanSub}.com`).trim(),
    ownerUid: ownerUid || null,
    plan: plan || 'Starter',
    aiMonthlyLimit: aiMonthlyLimit ? Number(aiMonthlyLimit) : 100,
    aiGenerationsUsed: 0,
    aiCurrentPeriod: currentPeriod,
    brandColor: brandColor || '#111111',
    createdAt: new Date().toISOString(),
    active: true
  };

  stores.push(newStore);
  saveStores(stores);

  // La nueva tienda inicia completamente limpia, con 0 prendas ni órdenes cargadas
  cachedProducts.set(newStore.id, []);
  cachedOrders.set(newStore.id, []);

  if (ownerUid) {
    linkStoreOwner({
      storeId: newStore.id,
      uid: ownerUid,
      email: newStore.ownerEmail,
      displayName: newStore.name,
      role: 'store_owner'
    });
  }

  return newStore;
}

function findStoresByOwner({ email, uid }) {
  const stores = getAllStores();
  const cleanEmail = (email || '').toLowerCase().trim();
  return stores.filter(s => {
    if (uid && s.ownerUid === uid) return true;
    if (cleanEmail && s.ownerEmail && s.ownerEmail.toLowerCase() === cleanEmail) return true;
    return false;
  });
}

function linkStoreOwner({ storeId, uid, email, displayName, role }) {
  const stores = getAllStores();
  const store = stores.find(s => s.id === storeId || s.subdomain === storeId);
  if (store) {
    if (uid) store.ownerUid = uid;
    if (email) store.ownerEmail = email;
    saveStores(stores);
  }

  if (FirebaseDb && typeof FirebaseDb.saveStoreOwner === 'function') {
    FirebaseDb.saveStoreOwner({
      uid,
      email: email || '',
      displayName: displayName || (store ? store.name : ''),
      role: role || 'store_owner',
      storeId: store ? store.id : (storeId || ''),
      subdomain: store ? store.subdomain : '',
      createdAt: new Date().toISOString()
    }).catch(err => console.warn('Firestore store owner sync note:', err.message));
  }
  return store;
}

function updateStore(id, updates) {
  const stores = getAllStores();
  const idx = stores.findIndex(s => s.id === id || s.subdomain === id);
  if (idx === -1) throw new Error('Tienda no encontrada');

  const s = stores[idx];
  if (updates.name !== undefined) s.name = updates.name.trim();
  if (updates.tagline !== undefined) s.tagline = updates.tagline.trim();
  if (updates.username !== undefined && updates.username.trim()) s.username = updates.username.trim();
  if (updates.password !== undefined && updates.password.trim()) s.password = updates.password.trim();
  if (updates.plan !== undefined) s.plan = updates.plan;
  if (updates.aiMonthlyLimit !== undefined) s.aiMonthlyLimit = Number(updates.aiMonthlyLimit);
  if (updates.aiGenerationsUsed !== undefined) s.aiGenerationsUsed = Number(updates.aiGenerationsUsed);
  if (updates.resetAiUsage === true) s.aiGenerationsUsed = 0;
  if (updates.brandColor !== undefined) s.brandColor = updates.brandColor;
  if (updates.about !== undefined) s.about = updates.about;
  if (updates.sections !== undefined) s.sections = updates.sections;
  if (updates.active !== undefined) s.active = Boolean(updates.active);

  stores[idx] = s;
  saveStores(stores);
  return s;
}

function getDefaultSectionsForStore(store) {
  const storeName = (store && store.name) || 'Nuestra Tienda';
  const about = (store && store.about) || {};
  const email = about.email || (store && store.ownerEmail) || `contacto@${(store && store.subdomain) || 'tienda'}.capfit.shop`;
  const phone = about.phone || '+54 9 11 5555-0199';
  const location = about.location || 'Buenos Aires, Argentina';
  const brandName = about.brandName || storeName;

  return {
    about: {
      brandName: brandName,
      tagline: about.tagline || (store && store.tagline) || 'Probadores virtuales de gorras y accesorios con IA.',
      story: about.story || `En ${storeName} fusionamos diseño de autor, materiales de máxima calidad y tecnología de probador virtual con Inteligencia Artificial.`,
      mission: about.mission || 'Brindar a cada cliente la seguridad de elegir el producto perfecto antes de comprar con probador interactivo.',
      vision: about.vision || 'Ser la marca referente en diseño de accesorios y moda urbana con probadores virtuales.',
      quality: about.quality || 'Selección rigurosa de tejidos, costuras reforzadas de alta durabilidad y herrajes anatómicos.',
      foundedYear: about.foundedYear || '2024',
      location: location,
      email: email,
      phone: phone,
      statsHappyClients: about.statsHappyClients || '+2.500',
      statsTryonAccuracy: about.statsTryonAccuracy || '99.2%',
      statsFastShipping: about.statsFastShipping || '24-48 hs'
    },
    faq: {
      subtitle: 'Encontrá respuestas rápidas sobre el probador con IA, envíos, medios de pago y garantías.',
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
          a: 'Tu privacidad es absoluta. Tu foto se procesa de forma efímera en la memoria de la sesión y se destruye inmediatamente después. Nunca almacenamos tus fotos biométricas ni las compartimos.'
        },
        {
          id: 'faq-3',
          cat: 'envios',
          q: '¿Cuánto tarda en llegar mi pedido y cuánto cuesta el envío?',
          a: 'Para CABA y Gran Buenos Aires las entregas se realizan entre 24 y 48 horas hábiles. Para el resto del país, entre 3 y 5 días hábiles vía Andreani o Correo Argentino. En compras superiores al mínimo promocional, ¡el envío es 100% gratuito!'
        },
        {
          id: 'faq-4',
          cat: 'pagos',
          q: '¿Cuáles son los medios de pago aceptados?',
          a: 'Aceptamos tarjetas de crédito, débito, transferencias y dinero en cuenta a través de Mercado Pago con la máxima seguridad antifraude.'
        },
        {
          id: 'faq-5',
          cat: 'garantia',
          q: '¿Qué hago si el producto no me queda como esperaba?',
          a: 'Contás con 30 días corridos desde que recibís tu pedido para solicitar cambio o devolución. El primer cambio de talle o modelo no tiene costo de flete.'
        }
      ]
    },
    envios: {
      freeShippingThreshold: 40000,
      freeShippingBanner: '¡Envío Gratis disponible! En compras superiores a $40.000 a cualquier punto del país.',
      standardTitle: 'Envío Estándar Nacional',
      standardTime: '3 a 5 días hábiles',
      standardCarrier: 'Andreani / Correo Argentino con seguimiento en tiempo real directo a tu puerta o sucursal.',
      expressTitle: 'Express CABA y GBA',
      expressTime: '24 a 48 hs hábiles',
      expressDesc: 'Servicio de mensajería prioritario para compras realizadas de Lunes a Viernes antes de las 13:00 hs.',
      pickupTitle: 'Retiro en Sucursal / Showroom',
      pickupTime: 'Gratis / Inmediato',
      pickupAddress: location,
      packagingTitle: 'Embalaje Protector Reforzado',
      packagingDesc: 'Despachamos cada pedido en cajas rígidas con soporte anatómico interno para que la gorra llegue con su horma original intacta.'
    },
    cambios: {
      daysGuarantee: 30,
      bannerTitle: '30 Días Corridos de Garantía Sin Preguntas',
      bannerDesc: 'Tenés hasta 30 días posteriores a la fecha de recepción para solicitar un cambio de producto o la devolución de tu dinero. El primer cambio de talle o modelo no tiene costo de flete.',
      step1Title: 'Contactanos',
      step1Desc: `Escribinos por WhatsApp al ${phone} o a ${email} indicando tu número de pedido y el motivo del cambio.`,
      step2Title: 'Despachá el Paquete',
      step2Desc: 'Te enviamos una etiqueta prepaga para que dejes el paquete en la sucursal de correo más cercana sin abonar nada.',
      step3Title: 'Recibí o Reintegrá',
      step3Desc: 'Una vez verificado el paquete, despachamos el nuevo modelo o te reintegramos el 100% de lo abonado.',
      cond1: 'El producto debe estar nuevo, sin uso, sin perfumes ni marcas.',
      cond2: 'Conservar la etiqueta original colocada y el empaque rígido.',
      cond3: 'Presentar el número de orden o comprobante de compra digital.',
      whatsappNumber: phone
    },
    contacto: {
      whatsapp: phone,
      whatsappDesc: 'Respuesta rápida (menos de 15 min)',
      email: email,
      emailDesc: 'Para consultas generales, pedidos especiales o soporte de compra',
      hoursTitle: 'Horarios de Atención',
      hoursDesc: 'Lunes a Sábados de 9:00 a 20:00 hs',
      locationTitle: 'Punto de Entrega & Showroom',
      locationDesc: location,
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
      art4Body: 'El compromiso de entrega está sujeto a la disponibilidad de stock físico. En caso de agostarse un artículo, ofreceremos un cambio inmediato o reembolso íntegro.',
      art5Title: '5. Propiedad Intelectual',
      art5Body: `Los signos distintivos, logotipos, imágenes y diseños son propiedad de ${storeName} y se encuentran protegidos por las leyes vigentes.`,
      art6Title: '6. Jurisdicción y Ley Aplicable',
      art6Body: 'Los presentes Términos y Condiciones se rigen por las leyes de la República Argentina.'
    },
    privacidad: {
      art1Title: '1. Privacidad por Diseño en el Probador Virtual',
      art1Body: 'Las fotografías o capturas utilizadas en el Probador IA se procesan de forma efímera en la memoria volátil de la sesión. Nunca almacenamos rasgos faciales, datos biométricos ni fotografías en servidores permanentes.',
      art2Title: '2. Datos Recopilados en el Proceso de Compra',
      art2Body: `Únicamente recopilamos los datos personales estrictamente necesarios para procesar y despachar tu pedido: nombre, dirección, teléfono y correo electrónico.`,
      art3Title: '3. Seguridad de Pagos',
      art3Body: 'No almacenamos datos financieros sensibles. Todas las transacciones se canalizan de manera cifrada a través de pasarelas de pago con certificación PCI-DSS.',
      art4Title: '4. Derechos del Titular de los Datos',
      art4Body: `De conformidad con la Ley N° 25.326, podés solicitar acceso, rectificación o eliminación de tus datos escribiendo a ${email}.`
    }
  };
}

function getStoreSections(storeId) {
  const store = getStoreById(storeId) || getStoreById('principal') || getAllStores()[0];
  if (!store) return {};

  const defaults = getDefaultSectionsForStore(store);
  const saved = store.sections || {};

  // Merge sobre nosotros: si ya tiene store.about, sincronizar
  const mergedAbout = { ...defaults.about, ...(store.about || {}), ...(saved.about || {}) };

  return {
    about: mergedAbout,
    faq: { ...defaults.faq, ...(saved.faq || {}) },
    envios: { ...defaults.envios, ...(saved.envios || {}) },
    cambios: { ...defaults.cambios, ...(saved.cambios || {}) },
    contacto: { ...defaults.contacto, ...(saved.contacto || {}) },
    terminos: { ...defaults.terminos, ...(saved.terminos || {}) },
    privacidad: { ...defaults.privacidad, ...(saved.privacidad || {}) }
  };
}

function updateStoreSections(storeId, sectionKey, sectionData) {
  const store = getStoreById(storeId);
  if (!store) throw new Error('Tienda no encontrada');

  const currentSections = getStoreSections(storeId);
  let updatedSections = { ...currentSections };

  if (sectionKey && sectionData) {
    updatedSections[sectionKey] = {
      ...(updatedSections[sectionKey] || {}),
      ...sectionData
    };
  } else if (typeof sectionData === 'object' && !sectionKey) {
    updatedSections = { ...updatedSections, ...sectionData };
  }

  // Si se actualizó about, reflejarlo también en store.about
  const updates = { sections: updatedSections };
  if (updatedSections.about) {
    updates.about = updatedSections.about;
  }

  updateStore(store.id, updates);
  return updatedSections;
}

function getDatabaseInfo() {
  const status = FirebaseDb && typeof FirebaseDb.getConnectionStatus === 'function'
    ? FirebaseDb.getConnectionStatus()
    : { isConnected: false, connectionError: null };

  return {
    provider: 'Firebase Firestore',
    edition: 'Enterprise Cloud DB',
    projectId: 'capfit-6689b',
    databaseId: '(default)',
    connected: status.isConnected,
    storageType: '100% Cloud Database (Firestore)',
    collections: ['stores', 'products', 'orders', 'ai_logs', 'store_owners'],
    multiTenant: true,
    statusText: status.isConnected ? 'Conectada y Operativa' : 'Verificando enlace'
  };
}

module.exports = {
  init,
  ensureInitialized,
  getAllStores,
  getStoreById,
  getStoreBySubdomain,
  resolveStoreFromRequest,
  readStoreProducts,
  fetchStoreProductsFromDb,
  writeStoreProducts,
  deleteStoreProduct,
  syncStoreProductsToFirestore,
  readStoreOrders,
  fetchStoreOrdersFromDb,
  writeStoreOrders,
  checkAndDeductAiCredit,
  getAiQuotaStatus,
  createStore,
  updateStore,
  getDefaultSectionsForStore,
  getStoreSections,
  updateStoreSections,
  getCurrentPeriod,
  getDatabaseInfo,
  findStoresByOwner,
  linkStoreOwner
};
