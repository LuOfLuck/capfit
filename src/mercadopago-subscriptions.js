/**
 * CAPFIT - Mercado Pago Recurring Subscriptions Service
 * Débito Automático Recurrente mediante la API Preapproval de Mercado Pago
 * Conversión fija acordada: 1 USD = $1.800 ARS
 */

const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const StoreManager = require('./store-manager');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'mercadopago_config.json');

// Cargar credenciales guardadas en disco al arrancar
function loadSavedCredentials() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        accessToken: parsed.accessToken || '',
        publicKey: parsed.publicKey || '',
        webhookSecret: parsed.webhookSecret || '',
        testBuyerEmail: parsed.testBuyerEmail || ''
      };
    }
  } catch (e) {
    console.warn('Nota al cargar mercadopago_config.json:', e.message);
  }
  return {
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '',
    publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || process.env.MP_PUBLIC_KEY || '',
    webhookSecret: process.env.MERCADO_PAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || '',
    testBuyerEmail: ''
  };
}

let _customCredentials = loadSavedCredentials();
let _cachedCollectorInfo = null;
let _cachedTestBuyer = null;

function saveCredentialsToDisk(creds) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(creds, null, 2), 'utf8');
  } catch (e) {
    console.warn('Error guardando mercadopago_config.json:', e.message);
  }
}

function getAccessToken() {
  return _customCredentials.accessToken || process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '';
}

function getWebhookSecret() {
  return _customCredentials.webhookSecret || process.env.MERCADO_PAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || '';
}

function getClient() {
  const token = getAccessToken();
  if (!token) return null;
  return new MercadoPagoConfig({ accessToken: token });
}

function setCredentials(creds = {}) {
  if (creds.accessToken !== undefined) _customCredentials.accessToken = creds.accessToken.trim();
  if (creds.publicKey !== undefined) _customCredentials.publicKey = creds.publicKey.trim();
  if (creds.webhookSecret !== undefined) _customCredentials.webhookSecret = creds.webhookSecret.trim();
  if (creds.testBuyerEmail !== undefined) _customCredentials.testBuyerEmail = creds.testBuyerEmail.trim();

  // Resetear cache de collector al cambiar credenciales
  _cachedCollectorInfo = null;
  _cachedTestBuyer = null;

  saveCredentialsToDisk(_customCredentials);

  const token = getAccessToken();
  return {
    hasAccessToken: Boolean(token),
    hasPublicKey: Boolean(_customCredentials.publicKey),
    hasWebhookSecret: Boolean(_customCredentials.webhookSecret),
    isSandbox: token ? token.startsWith('TEST-') : true
  };
}

function getCredentialsStatus() {
  const token = getAccessToken();
  return {
    configured: Boolean(token),
    hasAccessToken: Boolean(token),
    hasPublicKey: Boolean(_customCredentials.publicKey || process.env.MERCADO_PAGO_PUBLIC_KEY || process.env.MP_PUBLIC_KEY),
    hasWebhookSecret: Boolean(getWebhookSecret()),
    isSandbox: token ? token.startsWith('TEST-') : true,
    maskedToken: token ? `${token.substring(0, 8)}...${token.substring(token.length - 4)}` : ''
  };
}

/**
 * Obtiene información sobre la cuenta que cobra (Collector) para saber si es Test User o Real User
 */
async function getCollectorInfo(token) {
  if (_cachedCollectorInfo && _cachedCollectorInfo.token === token) {
    return _cachedCollectorInfo;
  }
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const email = data.email || '';
      const isTestUser = email.endsWith('@testuser.com') || email.startsWith('test_user_') || token.startsWith('TEST-');
      _cachedCollectorInfo = {
        token,
        id: data.id,
        email: email,
        site_id: data.site_id || 'MLA',
        isTestUser: Boolean(isTestUser)
      };
      return _cachedCollectorInfo;
    }
  } catch (e) {
    console.warn('[Mercado Pago] No se pudo obtener /users/me:', e.message);
  }
  return {
    token,
    id: null,
    email: '',
    site_id: 'MLA',
    isTestUser: token.startsWith('TEST-')
  };
}

/**
 * Crea o recupera un usuario comprador de prueba en Mercado Pago para Sandbox
 */
async function getOrGenerateTestBuyer(token) {
  if (_customCredentials.testBuyerEmail) {
    return _customCredentials.testBuyerEmail;
  }
  if (_cachedTestBuyer && _cachedTestBuyer.email) {
    return _cachedTestBuyer.email;
  }

  try {
    const res = await fetch('https://api.mercadopago.com/users/test_user', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ site_id: 'MLA', description: 'CAPFIT Test Buyer' })
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.email) {
        _cachedTestBuyer = data;
        _customCredentials.testBuyerEmail = data.email;
        saveCredentialsToDisk(_customCredentials);
        console.log(`[Mercado Pago] Test user comprador generado con éxito: ${data.email}`);
        // Breve pausa para propagación del nuevo usuario en microservicios de Mercado Pago
        await new Promise(resolve => setTimeout(resolve, 1200));
        return data.email;
      }
    }
  } catch (e) {
    console.warn('[Mercado Pago] No se pudo generar test buyer automáticamente:', e.message);
  }
  return null;
}

/**
 * Crea o inicializa la suscripción recurrente en Mercado Pago (Preapproval)
 */
async function createSubscriptionPreapproval({ planId, storeId, payerEmail, backUrl, host }) {
  const cleanPlanId = String(planId || 'free').toLowerCase();
  const plan = StoreManager.getPlanDetails(cleanPlanId);
  if (!plan) {
    throw new Error(`Plan "${planId}" no encontrado en el catálogo.`);
  }

  const store = StoreManager.getStoreById(storeId);
  if (!store) {
    throw new Error(`Tienda "${storeId}" no encontrada.`);
  }

  // 1. Plan FREE: Se activa de manera instantánea y gratuita sin pasar por pasarela
  if (cleanPlanId === 'free' || plan.price_monthly_ars === 0) {
    const updated = StoreManager.updateStore(store.id, {
      plan: plan.name,
      planId: plan.id,
      aiMonthlyLimit: plan.generations_per_month,
      subscriptionStatus: 'active',
      subscriptionId: 'free_tier',
      preapprovalId: null,
      subscribedAt: new Date().toISOString()
    });

    return {
      ok: true,
      plan: plan,
      store: updated,
      type: 'free_instant_activation',
      message: 'Plan FREE activado exitosamente.',
      init_point: null
    };
  }

  // 2. Planes de Pago (STARTER, GROWTH, PRO, ENTERPRISE)
  const token = getAccessToken();
  let domain = host;
  if (!domain || domain.includes('localhost') || domain.includes('127.0.0.1')) {
    domain = (store.subdomain ? `${store.subdomain}.capfit.store` : 'capfit.store');
  }
  const returnUrl = backUrl || `https://${domain}/#suscripcion?status=approved&plan=${plan.id}&store=${store.id}`;
  const externalReference = `sub_${store.id}_${plan.id}_${Date.now()}`;

  // Si hay Access Token configurado de Mercado Pago, llamamos a la API oficial de Preapproval
  if (token) {
    try {
      const collector = await getCollectorInfo(token);
      let effectiveEmail = (payerEmail || '').trim();

      if (collector.isTestUser) {
        // En modo Sandbox (el vendedor es un test user), el comprador DEBE ser un test user y NO el collector
        if (!effectiveEmail || !effectiveEmail.endsWith('@testuser.com') || effectiveEmail === collector.email) {
          const testBuyerEmail = await getOrGenerateTestBuyer(token);
          effectiveEmail = testBuyerEmail || `test_user_buyer_${Date.now()}@testuser.com`;
        }
      } else {
        // En modo Producción, el email debe ser un email real de comprador
        if (!effectiveEmail || effectiveEmail.endsWith('.shop') || effectiveEmail.includes('ejemplo.com')) {
          effectiveEmail = (store.ownerEmail && !store.ownerEmail.endsWith('.shop')) ? store.ownerEmail : 'lucasg33322@gmail.com';
        }
      }

      const payload = {
        reason: `Suscripción Mensual CAPFIT - Plan ${plan.name} (${store.name})`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: Number(plan.price_monthly_ars),
          currency_id: 'ARS'
        },
        back_url: returnUrl,
        payer_email: effectiveEmail,
        external_reference: externalReference
      };

      console.log(`[Mercado Pago] Creando preapproval para store=${store.id} plan=${plan.name} monto=$${plan.price_monthly_ars} ARS (payer=${effectiveEmail}, collector=${collector.email || collector.id})...`);

      let mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      let mpData = await mpResponse.json();

      // Manejo y reintento inteligente si la API reporta inconsistencia o retardo de propagación
      if (!mpResponse.ok) {
        console.warn(`⚠️ [Mercado Pago] Petición inicial falló (${mpResponse.status}):`, mpData);
        await new Promise(r => setTimeout(r, 1000));

        let retryRes = await fetch('https://api.mercadopago.com/preapproval', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (retryRes.ok) {
          mpResponse = retryRes;
          mpData = await retryRes.json();
          console.log('[Mercado Pago] Reintento exitoso!');
        } else {
          // Si el error es de incompatibilidad de usuarios, generar test buyer fresco
          const rawErr = JSON.stringify(mpData);
          if (rawErr.includes('Both payer and collector must be real or test users') || rawErr.includes('User bad request')) {
            console.log('[Mercado Pago] Generando comprador de prueba fresco...');
            _customCredentials.testBuyerEmail = '';
            _cachedTestBuyer = null;
            const freshBuyer = await getOrGenerateTestBuyer(token);
            if (freshBuyer) {
              payload.payer_email = freshBuyer;
              effectiveEmail = freshBuyer;
              await new Promise(r => setTimeout(r, 1200));
              const finalRetry = await fetch('https://api.mercadopago.com/preapproval', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
              });
              if (finalRetry.ok) {
                mpResponse = finalRetry;
                mpData = await finalRetry.json();
                console.log('[Mercado Pago] Reintento con test buyer nuevo exitoso!');
              }
            }
          }
        }
      }

      if (mpResponse.ok && (mpData.init_point || mpData.id)) {
        // Registrar suscripción preliminar como 'pending'
        StoreManager.updateStore(store.id, {
          preapprovalId: mpData.id,
          subscriptionStatus: 'pending',
          payerEmail: effectiveEmail
        });

        return {
          ok: true,
          plan: plan,
          amount_ars: plan.price_monthly_ars,
          preapproval_id: mpData.id,
          init_point: mpData.init_point,
          sandbox_init_point: mpData.sandbox_init_point || mpData.init_point,
          external_reference: externalReference,
          mode: collector.isTestUser ? 'sandbox' : 'production',
          test_buyer: _cachedTestBuyer ? { email: _cachedTestBuyer.email, password: _cachedTestBuyer.password } : null
        };
      }

      const errMsg = (mpData && (mpData.message || mpData.error)) || `HTTP ${mpResponse.status}`;
      console.error('[Mercado Pago] Error en respuesta de preapproval:', mpData);
      throw new Error(`Error en Mercado Pago: ${errMsg}`);
    } catch (mpError) {
      console.error('[Mercado Pago] Excepción en createSubscriptionPreapproval:', mpError.message);
      throw mpError;
    }
  }

  // 3. Modo Simulación / Prueba guiada si todavía no se cargó el token en variables de entorno
  console.log(`[Mercado Pago] Modo simulación para plan=${plan.name} ($${plan.price_monthly_ars} ARS)`);
  const simulatedId = `sim_sub_${store.id}_${plan.id}_${Date.now()}`;

  return {
    ok: true,
    simulated: true,
    plan: plan,
    amount_ars: plan.price_monthly_ars,
    preapproval_id: simulatedId,
    init_point: null,
    simulated_url: `${returnUrl}&simulated=true&preapproval_id=${simulatedId}`,
    message: `Plan ${plan.name} ($${plan.price_monthly_ars.toLocaleString('es-AR')} ARS/mes) preparado para checkout de Mercado Pago.`,
    note: 'Configurá tu MERCADO_PAGO_ACCESS_TOKEN en el botón "Mercado Pago Config" para usar el checkout en vivo de Mercado Pago.'
  };
}

/**
 * Procesa el Webhook de Mercado Pago para suscripciones recurrentes
 * Valida la firma HMAC, consulta el estado real en la API de Mercado Pago y activa el plan en Firestore
 * @param {Object} body Payload enviado por Mercado Pago
 * @param {Object} headers Cabeceras HTTP de la petición
 * @param {Object} query Parámetros URL (data.id, type, topic)
 */
async function processWebhook(body, headers = {}, query = {}) {
  try {
    const topic = body.type || body.topic || query.type || query.topic || '';
    const eventId = (body.data && body.data.id) || query.id || query['data.id'] || body.id;

    console.log(`[Mercado Pago Webhook] Recibido topic="${topic}" id="${eventId}" action="${body.action || ''}"`);

    // Validar firma de seguridad x-signature si el secret está disponible
    const signature = headers['x-signature'];
    const requestId = headers['x-request-id'];
    const secret = getWebhookSecret();

    if (secret && signature && requestId) {
      const isValid = verifyWebhookSignature({ signature, requestId, eventId, secret });
      if (!isValid) {
        console.warn('⚠️ [Mercado Pago Webhook] Firma HMAC inválida. Descartando petición sospechosa.');
        return { ok: false, error: 'Invalid HMAC signature' };
      }
    }

    // Identificar si el evento corresponde a suscripciones recurrentes (preapproval)
    const isSubscription = topic.includes('preapproval') || topic.includes('subscription');

    if (!isSubscription && topic !== 'payment') {
      return { ok: true, ignored: true, reason: `Evento "${topic}" no requiere acción en suscripciones.` };
    }

    let preapprovalData = null;
    const token = getAccessToken();

    // Consultar el estado real de la suscripción a Mercado Pago
    if (isSubscription && eventId && token) {
      try {
        const client = getClient();
        const preApprovalClient = new PreApproval(client);
        preapprovalData = await preApprovalClient.get({ id: String(eventId) });
      } catch (err) {
        console.warn(`[Mercado Pago Webhook] No se pudo consultar preapproval ${eventId}:`, err.message);
      }
    }

    // Si viene en el body directamente o tras consulta
    const status = (preapprovalData && preapprovalData.status) || body.status || (body.data && body.data.status);
    const extRef = (preapprovalData && preapprovalData.external_reference) || body.external_reference || '';

    // Parsear external_reference esperado: "sub_{storeId}_{planId}_{timestamp}"
    let targetStoreId = null;
    let targetPlanId = null;

    if (extRef && extRef.startsWith('sub_')) {
      const parts = extRef.split('_');
      if (parts.length >= 3) {
        targetStoreId = parts[1];
        targetPlanId = parts[2];
      }
    }

    // Si la suscripción fue autorizada/aprobada, activar el plan en la tienda
    if (status === 'authorized' || status === 'approved') {
      if (targetStoreId && targetPlanId) {
        const plan = StoreManager.getPlanDetails(targetPlanId);
        if (plan) {
          console.log(`🎉 [Mercado Pago Webhook] ¡Suscripción aprobada! Activando plan "${plan.name}" en tienda "${targetStoreId}" (${plan.generations_per_month} generaciones)...`);
          StoreManager.updateStore(targetStoreId, {
            plan: plan.name,
            planId: plan.id,
            aiMonthlyLimit: plan.generations_per_month,
            subscriptionStatus: 'active',
            subscriptionId: String(eventId),
            preapprovalId: String(eventId),
            subscribedAt: new Date().toISOString()
          });

          return {
            ok: true,
            action: 'plan_activated',
            storeId: targetStoreId,
            plan: plan.name,
            limit: plan.generations_per_month
          };
        }
      }
    } else if (status === 'cancelled' || status === 'paused') {
      if (targetStoreId) {
        console.log(`⚠️ [Mercado Pago Webhook] Suscripción cancelada/pausada para tienda "${targetStoreId}". Degradando a plan FREE.`);
        StoreManager.updateStore(targetStoreId, {
          plan: 'FREE',
          planId: 'free',
          aiMonthlyLimit: 20,
          subscriptionStatus: status,
          preapprovalId: null
        });

        return {
          ok: true,
          action: 'plan_downgraded_to_free',
          storeId: targetStoreId,
          status
        };
      }
    }

    return { ok: true, received: true, status: status || 'unhandled' };
  } catch (err) {
    console.error('[Mercado Pago Webhook] Excepción:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Verifica la firma HMAC-SHA256 del webhook de Mercado Pago
 */
function verifyWebhookSignature({ signature, requestId, eventId, secret }) {
  try {
    const parts = signature.split(',');
    let ts = '';
    let hash = '';

    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k.trim() === 'ts') ts = v.trim();
      if (k.trim() === 'v1') hash = v.trim();
    }

    if (!ts || !hash) return false;

    const manifest = `id:${eventId};request-id:${requestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(manifest);
    const calculatedHash = hmac.digest('hex');

    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calculatedHash, 'hex'));
  } catch (err) {
    console.warn('[Mercado Pago] Error validando firma HMAC:', err.message);
    return false;
  }
}

/**
 * Cancela una suscripción recurrente en Mercado Pago y degrada la tienda a FREE
 */
async function cancelSubscription(storeId) {
  const store = StoreManager.getStoreById(storeId);
  if (!store) throw new Error('Tienda no encontrada');

  const preapprovalId = store.preapprovalId || store.subscriptionId;
  const token = getAccessToken();

  if (preapprovalId && token && !preapprovalId.startsWith('sim_') && preapprovalId !== 'free_tier') {
    try {
      const client = getClient();
      const preApprovalClient = new PreApproval(client);
      await preApprovalClient.update({
        id: preapprovalId,
        body: { status: 'cancelled' }
      });
      console.log(`[Mercado Pago] Preapproval ${preapprovalId} cancelado exitosamente.`);
    } catch (err) {
      console.warn('[Mercado Pago] Nota al cancelar preapproval en MP:', err.message);
    }
  }

  // Degradar la tienda al plan FREE (20 fotos/mes)
  const updated = StoreManager.updateStore(store.id, {
    plan: 'FREE',
    planId: 'free',
    aiMonthlyLimit: 20,
    subscriptionStatus: 'cancelled',
    preapprovalId: null
  });

  return {
    ok: true,
    message: 'Suscripción cancelada. La tienda volvió al plan FREE (20 generaciones/mes).',
    store: updated
  };
}

module.exports = {
  createSubscriptionPreapproval,
  processWebhook,
  cancelSubscription,
  setCredentials,
  getCredentialsStatus,
  getAccessToken,
  getWebhookSecret
};
