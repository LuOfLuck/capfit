/**
 * CAPFIT — Módulo de Pagos Multi-Tenant con Mercado Pago (Checkout Pro Directo al Vendedor)
 *
 * Responsabilidades:
 * 1. OAuth 2.0 por tienda: Autorización con `state` firmado (HMAC), canje de `code` por credenciales
 *    del vendedor y renovación automática de `access_token` mediante `refresh_token`.
 * 2. Vinculación de credenciales manuales / de prueba por tienda (para testing inmediato en Sandbox o Producción).
 * 3. Creación de preferencias de Mercado Pago Checkout Pro usando EXCLUSIVAMENTE el Access Token
 *    de la tienda correspondiente al subdominio, SIN `application_fee` ni comisiones de CapFit.
 * 4. Procesamiento idempotente de Webhooks (`POST /api/webhooks/mercadopago`) verificando el pago
 *    directamente contra la API de Mercado Pago con las credenciales de esa tienda, actualizando el
 *    estado de la orden (`Aprobado`, `Pendiente`, `Rechazado`, `Cancelado`, `Reembolsado`) y
 *    restaurando stock automáticamente si un pago pendiente pasa a rechazado/cancelado.
 *
 * IMPORTANTE: Este módulo NO modifica ni interfiere con `src/mercadopago-subscriptions.js`
 * (sistema de suscripciones mensuales de CapFit).
 */

const crypto = require('crypto');
const AuthGuard = require('./auth-guard');
const StoreManager = require('./store-manager');
const FirebaseDb = require('./firebase-db');

const MP_OAUTH_AUTH_BASE = process.env.MP_OAUTH_AUTH_URL || 'https://auth.mercadopago.com.ar/authorization';
const MP_API_BASE = 'https://api.mercadopago.com';
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000; // 15 minutos

function getSigningSecret() {
  return (
    process.env.MP_TOKEN_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'capfit_serverless_default_hmac_secret_2026_v1'
  ).trim();
}

function getRequestBaseUrl(req) {
  if (!req || !req.headers) {
    return process.env.APP_BASE_URL || 'https://app.capfit.store';
  }
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}`;
}

function getOAuthRedirectUri(req) {
  if (process.env.MP_REDIRECT_URI && process.env.MP_REDIRECT_URI.trim()) {
    return process.env.MP_REDIRECT_URI.trim();
  }
  return `${getRequestBaseUrl(req)}/api/mp/oauth/callback`;
}

/**
 * Firma un parámetro `state` para OAuth vinculado exclusivamente a `storeId`
 */
function signOAuthState(storeId) {
  if (!storeId) throw new Error('storeId es obligatorio para generar state OAuth');
  const payload = {
    purpose: 'mp_oauth_store_connect',
    storeId: String(storeId).trim(),
    nonce: crypto.randomBytes(8).toString('hex'),
    iat: Date.now(),
    exp: Date.now() + OAUTH_STATE_TTL_MS
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
  return `mpst.${payloadB64}.${sig}`;
}

/**
 * Verifica el parámetro `state` devuelto por Mercado Pago OAuth
 */
function verifyOAuthState(stateToken) {
  if (!stateToken || typeof stateToken !== 'string' || !stateToken.startsWith('mpst.')) {
    return { valid: false, error: 'Parámetro state OAuth inválido o ausente.' };
  }
  const parts = stateToken.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Formato de state OAuth malformado.' };
  }
  const [, payloadB64, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');

  const bufA = Buffer.from(providedSig, 'utf8');
  const bufB = Buffer.from(expectedSig, 'utf8');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return { valid: false, error: 'Firma criptográfica de state OAuth inválida.' };
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (decoded.purpose !== 'mp_oauth_store_connect' || !decoded.storeId) {
      return { valid: false, error: 'Propósito de state OAuth inválido.' };
    }
    if (typeof decoded.exp === 'number' && Date.now() > decoded.exp) {
      return { valid: false, error: 'La solicitud de autorización OAuth expiró. Intentá conectar nuevamente.' };
    }
    return { valid: true, storeId: decoded.storeId, payload: decoded };
  } catch (err) {
    return { valid: false, error: 'No se pudo decodificar el state OAuth.' };
  }
}

/**
 * Genera la URL oficial de autorización OAuth de Mercado Pago para una tienda específica
 */
function generateOAuthAuthorizeUrl({ storeId, req }) {
  const cleanStoreId = String(storeId || '').trim();
  if (!cleanStoreId) {
    throw new Error('Se requiere el identificador de la tienda para iniciar OAuth con Mercado Pago.');
  }

  const store = StoreManager.getStoreById(cleanStoreId);
  if (!store) {
    throw new Error(`La tienda "${cleanStoreId}" no existe.`);
  }

  const clientId = (process.env.MP_CLIENT_ID || '').trim();
  const redirectUri = getOAuthRedirectUri(req);
  const state = signOAuthState(store.id);

  if (!clientId) {
    return {
      ok: false,
      clientIdConfigured: false,
      storeId: store.id,
      state,
      redirectUri,
      error: 'Falta configurar MP_CLIENT_ID y MP_CLIENT_SECRET de la aplicación OAuth en las variables de entorno del servidor. Podés vincular tu cuenta inmediatamente usando un Access Token en la opción "Vincular Token de Prueba / Directo".'
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: redirectUri
  });

  return {
    ok: true,
    clientIdConfigured: true,
    storeId: store.id,
    state,
    redirectUri,
    authorizeUrl: `${MP_OAUTH_AUTH_BASE}?${params.toString()}`
  };
}

/**
 * Obtiene información básica del usuario vendedor en Mercado Pago (/users/me)
 */
async function fetchMercadoPagoSellerProfile(accessToken, fetchImpl = global.fetch) {
  if (!accessToken || typeof fetchImpl !== 'function') return null;
  try {
    const res = await fetchImpl(`${MP_API_BASE}/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res || !res.ok) return null;
    const data = await res.json();
    return {
      mpUserId: data.id ? String(data.id) : null,
      email: data.email || null,
      nickname: data.nickname || null,
      firstName: data.first_name || null,
      lastName: data.last_name || null,
      siteId: data.site_id || 'MLA'
    };
  } catch (_) {
    return null;
  }
}

/**
 * Intercambia el código de autorización OAuth (`code`) por credenciales del vendedor y las guarda cifradas
 */
async function exchangeOAuthCodeForStore({ code, state, req, fetchImpl = global.fetch }) {
  if (!code || typeof code !== 'string') {
    const err = new Error('Código de autorización OAuth (code) ausente.');
    err.status = 400;
    throw err;
  }

  const stateCheck = verifyOAuthState(state);
  if (!stateCheck.valid) {
    const err = new Error(stateCheck.error || 'State OAuth inválido.');
    err.status = 400;
    throw err;
  }

  const storeId = stateCheck.storeId;
  const store = StoreManager.getStoreById(storeId);
  if (!store) {
    const err = new Error(`La tienda "${storeId}" no existe.`);
    err.status = 404;
    throw err;
  }

  const clientId = (process.env.MP_CLIENT_ID || '').trim();
  const clientSecret = (process.env.MP_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    const err = new Error('MP_CLIENT_ID y MP_CLIENT_SECRET deben estar configurados en el servidor para intercambiar códigos OAuth.');
    err.status = 400;
    throw err;
  }

  const redirectUri = getOAuthRedirectUri(req);
  const tokenRes = await fetchImpl(`${MP_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code: code.trim(),
      redirect_uri: redirectUri
    })
  });

  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    const err = new Error(tokenData.message || tokenData.error_description || tokenData.error || 'Error al canjear código OAuth con Mercado Pago.');
    err.status = tokenRes.status || 400;
    throw err;
  }

  const profile = await fetchMercadoPagoSellerProfile(tokenData.access_token, fetchImpl);
  const expiresInSec = Number(tokenData.expires_in) || 15552000; // Default 180 días
  const expiresAtIso = new Date(Date.now() + expiresInSec * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const mpUserId = String(tokenData.user_id || (profile && profile.mpUserId) || '');
  const accountLabel =
    (profile && (profile.email || profile.nickname)) ||
    (mpUserId ? `Cuenta MP #${mpUserId}` : `Vendedor ${store.name}`);
  const liveMode = tokenData.live_mode !== undefined ? Boolean(tokenData.live_mode) : !String(tokenData.access_token).startsWith('TEST-');

  await StoreManager.saveStorePaymentCredentials(store.id, {
    mpConnected: true,
    mpConnectionMode: 'oauth',
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    mpPublicKey: tokenData.public_key || null,
    mpUserId,
    mpAccountLabel: accountLabel,
    mpLiveMode: liveMode,
    mpTokenExpiresAt: expiresAtIso,
    mpConnectedAt: nowIso
  });

  const updatedStore = StoreManager.updateStore(store.id, {
    mpConnected: true,
    mpConnectionMode: 'oauth',
    mpAccountLabel: accountLabel,
    mpLiveMode: liveMode,
    mpUserId,
    mpConnectedAt: nowIso
  });

  return {
    ok: true,
    storeId: store.id,
    mpConnected: true,
    mpConnectionMode: 'oauth',
    mpAccountLabel: accountLabel,
    mpUserId,
    mpLiveMode: liveMode,
    mpTokenExpiresAt: expiresAtIso,
    store: updatedStore
  };
}

/**
 * Vincula credenciales manuales / de prueba (TEST-... o APP_USR-...) exclusivamente a una tienda
 */
async function connectManualTokenForStore({ storeId, accessToken, publicKey = null, accountLabel = null, fetchImpl = global.fetch }) {
  const cleanStoreId = String(storeId || '').trim();
  const cleanToken = String(accessToken || '').trim();

  if (!cleanStoreId) {
    const err = new Error('El identificador de la tienda es obligatorio.');
    err.status = 400;
    throw err;
  }

  const store = StoreManager.getStoreById(cleanStoreId);
  if (!store) {
    const err = new Error(`La tienda "${cleanStoreId}" no existe.`);
    err.status = 404;
    throw err;
  }

  if (!cleanToken || cleanToken.length < 16 || (!cleanToken.startsWith('APP_USR-') && !cleanToken.startsWith('TEST-'))) {
    const err = new Error('El Access Token de Mercado Pago debe comenzar con "APP_USR-" (Producción/Credenciales de prueba) o "TEST-" y tener un formato válido.');
    err.status = 400;
    throw err;
  }

  const profile = await fetchMercadoPagoSellerProfile(cleanToken, fetchImpl);
  const isTestToken = cleanToken.startsWith('TEST-');
  const nowIso = new Date().toISOString();

  const resolvedUserId = (profile && profile.mpUserId) || (isTestToken ? `sandbox_${store.id}` : `mp_${store.id}`);
  const resolvedLabel =
    (accountLabel && String(accountLabel).trim()) ||
    (profile && (profile.email || profile.nickname)) ||
    (isTestToken ? `Sandbox Test (${store.subdomain})` : `Cuenta MP (${store.subdomain})`);

  await StoreManager.saveStorePaymentCredentials(store.id, {
    mpConnected: true,
    mpConnectionMode: 'manual',
    accessToken: cleanToken,
    refreshToken: null,
    mpPublicKey: publicKey ? String(publicKey).trim() : null,
    mpUserId: resolvedUserId,
    mpAccountLabel: resolvedLabel,
    mpLiveMode: !isTestToken,
    mpTokenExpiresAt: null,
    mpConnectedAt: nowIso
  });

  const updatedStore = StoreManager.updateStore(store.id, {
    mpConnected: true,
    mpConnectionMode: 'manual',
    mpAccountLabel: resolvedLabel,
    mpLiveMode: !isTestToken,
    mpUserId: resolvedUserId,
    mpConnectedAt: nowIso
  });

  return {
    ok: true,
    storeId: store.id,
    mpConnected: true,
    mpConnectionMode: 'manual',
    mpAccountLabel: resolvedLabel,
    mpUserId: resolvedUserId,
    mpLiveMode: !isTestToken,
    store: updatedStore
  };
}

/**
 * Desconecta la cuenta de Mercado Pago de una tienda y elimina sus tokens cifrados
 */
async function disconnectStoreMercadoPago(storeId) {
  const cleanStoreId = String(storeId || '').trim();
  const store = StoreManager.getStoreById(cleanStoreId);
  if (!store) {
    const err = new Error(`La tienda "${cleanStoreId}" no existe.`);
    err.status = 404;
    throw err;
  }

  await StoreManager.clearStorePaymentCredentials(store.id);
  const updatedStore = StoreManager.updateStore(store.id, {
    mpConnected: false,
    mpConnectionMode: null,
    mpAccountLabel: null,
    mpLiveMode: false,
    mpUserId: null,
    mpConnectedAt: null
  });

  return {
    ok: true,
    storeId: store.id,
    mpConnected: false,
    store: updatedStore
  };
}

/**
 * Obtiene el estado seguro de conexión de Mercado Pago de una tienda (sin exponer jamás el access_token completo)
 */
async function getStoreConnectionStatus(storeId) {
  const cleanStoreId = String(storeId || '').trim();
  const store = StoreManager.getStoreById(cleanStoreId) || await StoreManager.getStorePublic(cleanStoreId);
  if (!store) {
    const err = new Error(`La tienda "${cleanStoreId}" no existe.`);
    err.status = 404;
    throw err;
  }

  const creds = await StoreManager.getStorePaymentCredentials(store.id);
  const isConnected = Boolean(creds && creds.accessToken);

  // Sincronizar bandera pública en memoria si difiere
  if (Boolean(store.mpConnected) !== isConnected) {
    StoreManager.updateStore(store.id, {
      mpConnected: isConnected,
      mpAccountLabel: isConnected ? (creds.mpAccountLabel || store.mpAccountLabel || `Cuenta MP (${store.subdomain})`) : null,
      mpConnectionMode: isConnected ? (creds.mpConnectionMode || 'oauth') : null,
      mpLiveMode: isConnected ? Boolean(creds.mpLiveMode) : false,
      mpUserId: isConnected ? (creds.mpUserId || null) : null,
      mpConnectedAt: isConnected ? (creds.mpConnectedAt || null) : null
    });
  }

  let maskedTokenHint = null;
  if (isConnected && creds.accessToken) {
    const t = String(creds.accessToken);
    maskedTokenHint = `${t.slice(0, 8)}••••${t.slice(-4)}`;
  }

  return {
    ok: true,
    storeId: store.id,
    storeName: store.name,
    subdomain: store.subdomain,
    mpConnected: isConnected,
    mpConnectionMode: isConnected ? (creds.mpConnectionMode || 'oauth') : null,
    mpAccountLabel: isConnected ? (creds.mpAccountLabel || `Cuenta MP (${store.subdomain})`) : null,
    mpUserId: isConnected ? (creds.mpUserId || null) : null,
    mpLiveMode: isConnected ? Boolean(creds.mpLiveMode) : false,
    mpTokenExpiresAt: isConnected ? (creds.mpTokenExpiresAt || null) : null,
    mpConnectedAt: isConnected ? (creds.mpConnectedAt || null) : null,
    hasRefreshToken: Boolean(isConnected && creds.refreshToken),
    maskedTokenHint,
    oauthClientConfigured: Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET)
  };
}

/**
 * Recupera las credenciales de Mercado Pago de una tienda y renueva el token OAuth automáticamente si está vencido o próximo a vencer (<24h)
 */
async function ensureFreshStoreAccessToken(storeId, { fetchImpl = global.fetch, forceRefresh = false } = {}) {
  const cleanStoreId = String(storeId || '').trim();
  const creds = await StoreManager.getStorePaymentCredentials(cleanStoreId);
  if (!creds || !creds.accessToken) {
    return null;
  }

  const shouldCheckExpiry = creds.mpConnectionMode === 'oauth' && creds.refreshToken;
  if (!shouldCheckExpiry) {
    return creds;
  }

  const nowMs = Date.now();
  const expiresMs = creds.mpTokenExpiresAt ? new Date(creds.mpTokenExpiresAt).getTime() : null;
  const isExpiringSoon = expiresMs !== null && !isNaN(expiresMs) && (nowMs + 24 * 60 * 60 * 1000 >= expiresMs);

  if (!forceRefresh && !isExpiringSoon) {
    return creds;
  }

  const clientId = (process.env.MP_CLIENT_ID || '').trim();
  const clientSecret = (process.env.MP_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || typeof fetchImpl !== 'function') {
    return creds;
  }

  try {
    const refreshRes = await fetchImpl(`${MP_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken
      })
    });

    const refreshData = await refreshRes.json().catch(() => ({}));
    if (refreshRes.ok && refreshData.access_token) {
      const expiresInSec = Number(refreshData.expires_in) || 15552000;
      const updatedCreds = {
        ...creds,
        accessToken: refreshData.access_token,
        refreshToken: refreshData.refresh_token || creds.refreshToken,
        mpPublicKey: refreshData.public_key || creds.mpPublicKey || null,
        mpTokenExpiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
        mpRefreshedAt: new Date().toISOString()
      };
      await StoreManager.saveStorePaymentCredentials(cleanStoreId, updatedCreds);
      return updatedCreds;
    }
  } catch (err) {
    console.warn(`[MercadoPagoStorePayments] Aviso al renovar token OAuth para "${cleanStoreId}":`, err.message);
  }

  return creds;
}

/**
 * Construye y crea la preferencia de Mercado Pago Checkout Pro usando EXCLUSIVAMENTE las credenciales del vendedor de la tienda.
 * Garantiza 0% de comisión de plataforma (omite `application_fee` y `marketplace_fee`).
 */
async function createStoreCheckoutPreference({ storeObj, order, req, fetchImpl = global.fetch }) {
  if (!storeObj || !storeObj.id) {
    const err = new Error('Tienda inválida para generar preferencia de pago.');
    err.status = 400;
    throw err;
  }
  if (!order || !order.id || !Array.isArray(order.items) || order.items.length === 0) {
    const err = new Error('Orden inválida o sin productos para generar preferencia de pago.');
    err.status = 400;
    throw err;
  }

  const creds = await ensureFreshStoreAccessToken(storeObj.id, { fetchImpl });
  if (!creds || !creds.accessToken) {
    const err = new Error(`La tienda "${storeObj.name || storeObj.id}" aún no conectó su cuenta de Mercado Pago.`);
    err.status = 409;
    err.code = 'MP_NOT_CONNECTED';
    throw err;
  }

  const baseUrl = getRequestBaseUrl(req);
  const storeQueryParam = `store=${encodeURIComponent(storeObj.id)}&order_id=${encodeURIComponent(order.id)}`;
  const backUrls = {
    success: `${baseUrl}/?mp_return=success&${storeQueryParam}`,
    pending: `${baseUrl}/?mp_return=pending&${storeQueryParam}`,
    failure: `${baseUrl}/?mp_return=failure&${storeQueryParam}`
  };

  const notificationUrl = `${baseUrl}/api/webhooks/mercadopago?storeId=${encodeURIComponent(storeObj.id)}`;
  const externalReference = order.externalReference || `ord_${storeObj.id}_${order.id}`;

  const mpItems = order.items.map((item) => ({
    id: String(item.id),
    title: `${item.nombre}${item.color ? ` (${item.color})` : ''}`,
    description: `${storeObj.name || 'Tienda'} — ${item.nombre}`,
    category_id: 'fashion',
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    currency_id: 'ARS',
    unit_price: Number(item.precio || item.unitPrice)
  }));

  // Armar preferencia de Checkout Pro SIN application_fee ni marketplace_fee
  const preferencePayload = {
    items: mpItems,
    payer: {
      name: (order.customer && order.customer.name) || 'Comprador',
      email: order.buyerEmail || (order.customer && order.customer.email) || 'comprador@ejemplo.com',
      phone: {
        number: (order.customer && order.customer.phone) || ''
      },
      address: {
        street_name: (order.customer && order.customer.address) || '',
        zip_code: (order.customer && order.customer.postalCode) || ''
      }
    },
    shipments: {
      cost: Math.max(0, Number(order.shipping || 0)),
      mode: 'not_specified'
    },
    back_urls: backUrls,
    auto_return: 'approved',
    external_reference: externalReference,
    notification_url: notificationUrl,
    statement_descriptor: String(storeObj.name || 'CAPFIT').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 22) || 'TIENDA',
    metadata: {
      store_id: storeObj.id,
      store_subdomain: storeObj.subdomain || storeObj.id,
      order_id: order.id,
      external_reference: externalReference
    }
  };

  // Llamada a la API oficial de Mercado Pago usando el Access Token de la tienda vendedora
  let prefData = null;
  let mpApiError = null;

  if (typeof fetchImpl === 'function') {
    try {
      const mpRes = await fetchImpl(`${MP_API_BASE}/checkout/preferences`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `pref_${storeObj.id}_${order.id}`
        },
        body: JSON.stringify(preferencePayload)
      });

      const bodyJson = await mpRes.json().catch(() => ({}));
      if (mpRes.ok && bodyJson && bodyJson.id) {
        prefData = bodyJson;
      } else {
        mpApiError = bodyJson.message || bodyJson.error || `HTTP ${mpRes.status}`;
      }
    } catch (netErr) {
      mpApiError = netErr.message;
    }
  }

  // Soporte de sandbox controlado cuando se usa un token de prueba TEST- en entornos de testeo sin salida a MP
  if (!prefData && String(creds.accessToken).startsWith('TEST-')) {
    const sandboxPrefId = `sandbox_pref_${storeObj.id}_${Date.now()}`;
    const simulatedCheckoutUrl = `${baseUrl}/?mp_sandbox_checkout=1&store=${encodeURIComponent(storeObj.id)}&order_id=${encodeURIComponent(order.id)}&pref_id=${encodeURIComponent(sandboxPrefId)}`;
    prefData = {
      id: sandboxPrefId,
      init_point: simulatedCheckoutUrl,
      sandbox_init_point: simulatedCheckoutUrl,
      external_reference: externalReference,
      sandbox_simulated: true
    };
  }

  if (!prefData || !prefData.id) {
    const err = new Error(`Error al generar preferencia en Mercado Pago para "${storeObj.name}": ${mpApiError || 'Credenciales rechazadas por Mercado Pago'}`);
    err.status = 502;
    err.code = 'MP_PREFERENCE_CREATION_FAILED';
    throw err;
  }

  // Actualizar la orden en Firestore con el ID de preferencia y la referencia externa
  order.mpPreferenceId = prefData.id;
  order.externalReference = externalReference;
  order.mpSellerUserId = creds.mpUserId || null;
  await StoreManager.saveSingleStoreOrder(storeObj.id, order);

  return {
    ok: true,
    storeId: storeObj.id,
    orderId: order.id,
    preferenceId: prefData.id,
    externalReference,
    initPoint: prefData.init_point || prefData.sandbox_init_point,
    sandboxInitPoint: prefData.sandbox_init_point || prefData.init_point,
    isLiveMode: Boolean(creds.mpLiveMode),
    preferencePayload // expuesto internamente para auditoría/tests de que no existe application_fee
  };
}

/**
 * Mapea el status oficial de Mercado Pago al estado de pago e interno de CapFit
 */
function mapMercadoPagoStatus(mpStatus) {
  const s = String(mpStatus || '').toLowerCase().trim();
  if (s === 'approved') {
    return { paymentStatus: 'Aprobado', status: 'paid', shouldRestoreStock: false };
  }
  if (s === 'pending' || s === 'in_process' || s === 'authorized') {
    return { paymentStatus: 'Pendiente', status: 'pending', shouldRestoreStock: false };
  }
  if (s === 'rejected') {
    return { paymentStatus: 'Rechazado', status: 'cancelled', shouldRestoreStock: true };
  }
  if (s === 'cancelled') {
    return { paymentStatus: 'Cancelado', status: 'cancelled', shouldRestoreStock: true };
  }
  if (s === 'refunded' || s === 'charged_back') {
    return { paymentStatus: 'Reembolsado', status: 'refunded', shouldRestoreStock: false };
  }
  return { paymentStatus: 'Pendiente', status: 'pending', shouldRestoreStock: false };
}

/**
 * Extrae `{ storeId, orderId }` desde un `external_reference` con formato `ord_{storeId}_{orderId}`
 */
function parseExternalReference(externalRef) {
  if (!externalRef || typeof externalRef !== 'string') return null;
  const trimmed = externalRef.trim();
  if (!trimmed.startsWith('ord_')) return null;
  const withoutPrefix = trimmed.slice(4);
  const firstUnderscore = withoutPrefix.indexOf('_');
  if (firstUnderscore <= 0) return null;
  const storeId = withoutPrefix.slice(0, firstUnderscore);
  const orderId = withoutPrefix.slice(firstUnderscore + 1);
  if (!storeId || !orderId) return null;
  return { storeId, orderId };
}

/**
 * Procesa de forma segura e idempotente una notificación de pago de Mercado Pago (Webhook o retorno de Checkout Pro)
 */
async function processStorePaymentNotification({
  storeId,
  paymentId,
  externalReferenceHint = null,
  sandboxStatusOverride = null,
  fetchImpl = global.fetch
}) {
  if (!paymentId) {
    const err = new Error('paymentId es requerido para verificar el pago.');
    err.status = 400;
    throw err;
  }

  let resolvedStoreId = storeId ? String(storeId).trim() : null;
  if (!resolvedStoreId && externalReferenceHint) {
    const parsedHint = parseExternalReference(externalReferenceHint);
    if (parsedHint) resolvedStoreId = parsedHint.storeId;
  }

  if (!resolvedStoreId) {
    const err = new Error('No se pudo determinar la tienda asociada a la notificación de pago.');
    err.status = 400;
    throw err;
  }

  const creds = await ensureFreshStoreAccessToken(resolvedStoreId, { fetchImpl });
  if (!creds || !creds.accessToken) {
    const err = new Error(`La tienda "${resolvedStoreId}" no posee credenciales de Mercado Pago configuradas para verificar el pago.`);
    err.status = 409;
    err.code = 'MP_NOT_CONNECTED';
    throw err;
  }

  let mpPayment = null;

  // 1. Consultar el pago real en la API de Mercado Pago con el Access Token de esa tienda
  if (typeof fetchImpl === 'function' && !sandboxStatusOverride) {
    try {
      const payRes = await fetchImpl(`${MP_API_BASE}/v1/payments/${encodeURIComponent(String(paymentId))}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (payRes && payRes.ok) {
        mpPayment = await payRes.json();
      } else if (payRes) {
        const errBody = await payRes.json().catch(() => ({}));
        const err = new Error(errBody.message || `Mercado Pago devolvió HTTP ${payRes.status} al consultar el pago ${paymentId}`);
        err.status = payRes.status === 404 ? 404 : 502;
        throw err;
      }
    } catch (fetchErr) {
      if (fetchErr.status) throw fetchErr;
      const err = new Error(`Error consultando pago en Mercado Pago: ${fetchErr.message}`);
      err.status = 502;
      throw err;
    }
  }

  // Permitir confirmación de pruebas en modo Sandbox (`TEST-...`) cuando se usa el flujo de retorno controlado
  if (!mpPayment && sandboxStatusOverride && String(creds.accessToken).startsWith('TEST-')) {
    mpPayment = {
      id: String(paymentId),
      status: sandboxStatusOverride,
      external_reference: externalReferenceHint,
      payment_type_id: 'account_money'
    };
  }

  if (!mpPayment || !mpPayment.status) {
    const err = new Error(`No se pudo obtener información verificada del pago ${paymentId}.`);
    err.status = 404;
    throw err;
  }

  const extRef = mpPayment.external_reference || externalReferenceHint;
  const parsedRef = parseExternalReference(extRef);
  if (!parsedRef) {
    const err = new Error(`El pago ${paymentId} no contiene una external_reference válida de CapFit.`);
    err.status = 400;
    throw err;
  }

  // Verificar aislamiento multi-tenant: el pago debe pertenecer a la tienda esperada
  if (String(parsedRef.storeId).toLowerCase() !== String(resolvedStoreId).toLowerCase()) {
    const err = new Error(`Aislamiento violado: el pago pertenece a la tienda "${parsedRef.storeId}", no a "${resolvedStoreId}".`);
    err.status = 403;
    throw err;
  }

  let order = await StoreManager.getSingleStoreOrder(resolvedStoreId, parsedRef.orderId);
  if (!order && FirebaseDb && typeof FirebaseDb.getOrderByExternalReference === 'function') {
    order = await FirebaseDb.getOrderByExternalReference(resolvedStoreId, extRef);
  }

  if (!order) {
    const err = new Error(`Orden "${parsedRef.orderId}" no encontrada en la tienda "${resolvedStoreId}".`);
    err.status = 404;
    throw err;
  }

  // Validar que el importe cobrado coincida con el total calculado por el servidor
  if (mpPayment.transaction_amount !== undefined && mpPayment.transaction_amount !== null) {
    const paidAmount = Number(mpPayment.transaction_amount);
    const expectedTotal = Number(order.total || order.totalAmount || 0);
    // El pago puede incluir o no el costo de envío dentro de transaction_amount según configuración
    const expectedSubtotal = Number(order.subtotal || expectedTotal);
    if (paidAmount + 1 < expectedSubtotal) {
      const err = new Error(`Importe pagado ($${paidAmount}) inferior al monto de la orden ($${expectedTotal}).`);
      err.status = 400;
      throw err;
    }
  }

  const mapped = mapMercadoPagoStatus(mpPayment.status);
  const eventId = `mp_pay_${paymentId}_${String(mpPayment.status).toLowerCase()}`;
  const processedList = Array.isArray(order.processedWebhookIds) ? [...order.processedWebhookIds] : [];

  // Idempotencia: si esta transición exacta ya fue aplicada, retornar sin duplicar efectos
  if (processedList.includes(eventId)) {
    return {
      ok: true,
      idempotent: true,
      alreadyProcessed: true,
      storeId: resolvedStoreId,
      orderId: order.id,
      paymentId: String(paymentId),
      mpStatus: mpPayment.status,
      paymentStatus: order.paymentStatus,
      order
    };
  }

  const previousPaymentStatus = order.paymentStatus;
  processedList.push(eventId);

  order.paymentStatus = mapped.paymentStatus;
  order.status = mapped.status;
  order.mpPaymentId = String(paymentId);
  order.mpStatusDetail = mpPayment.status_detail || null;
  order.processedWebhookIds = processedList;
  order.updatedAt = new Date().toISOString();

  if (mapped.paymentStatus === 'Aprobado' && !order.paidAt) {
    order.paidAt = new Date().toISOString();
  }

  // Si la orden pasa a Rechazado o Cancelado y tenía stock reservado, restaurar el stock una única vez
  if (mapped.shouldRestoreStock && !order.stockRestored && previousPaymentStatus !== 'Rechazado' && previousPaymentStatus !== 'Cancelado') {
    try {
      const products = await StoreManager.fetchStoreProductsFromDb(resolvedStoreId);
      if (Array.isArray(order.items) && Array.isArray(products)) {
        for (const item of order.items) {
          const prod = products.find((p) => String(p.id) === String(item.id));
          if (prod && prod.stock !== undefined) {
            prod.stock = Number(prod.stock) + Math.max(1, parseInt(item.quantity, 10) || 1);
          }
        }
        StoreManager.writeStoreProducts(resolvedStoreId, products);
      }
      order.stockRestored = true;
    } catch (stockErr) {
      console.warn(`[MercadoPagoStorePayments] Aviso restaurando stock en orden ${order.id}:`, stockErr.message);
    }
  }

  const savedOrder = await StoreManager.saveSingleStoreOrder(resolvedStoreId, order);

  return {
    ok: true,
    idempotent: true,
    alreadyProcessed: false,
    storeId: resolvedStoreId,
    orderId: savedOrder.id,
    paymentId: String(paymentId),
    mpStatus: mpPayment.status,
    paymentStatus: savedOrder.paymentStatus,
    order: savedOrder
  };
}

module.exports = {
  signOAuthState,
  verifyOAuthState,
  generateOAuthAuthorizeUrl,
  exchangeOAuthCodeForStore,
  connectManualTokenForStore,
  disconnectStoreMercadoPago,
  getStoreConnectionStatus,
  ensureFreshStoreAccessToken,
  createStoreCheckoutPreference,
  processStorePaymentNotification,
  parseExternalReference,
  mapMercadoPagoStatus
};
