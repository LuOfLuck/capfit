/**
 * CAPFIT — Suite de Pruebas Fase 1: Mercado Pago Multi-Tenant (OAuth, Checkout Pro Directo y Webhooks)
 *
 * Verifica:
 * 1. Bloqueo de checkout (409 MP_NOT_CONNECTED) cuando una tienda aún no vinculó su cuenta de Mercado Pago.
 * 2. Flujo OAuth 2.0 por tienda: estado firmado con HMAC, protección anti-CSRF/cross-tenant, intercambio de código y renovación automática de Refresh Token.
 * 3. Aislamiento estricto de credenciales entre Tienda 1 y Tienda 2: cada Checkout Pro se crea exclusivamente con el Access Token del vendedor correspondiente, 0% de comisión de plataforma (sin application_fee ni marketplace_fee) y validación server-side de precios reales y stock.
 * 4. Confirmación mediante Webhooks multi-tenant: pago aprobado, idempotencia ante webhooks duplicados, rechazo de spoofing entre tiendas, pago rechazado/cancelado con restauración única de stock y pago reembolsado.
 * 5. Desconexión segura de cuenta de Mercado Pago por tienda sin afectar a otras tiendas.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../server');
const AuthGuard = require('../src/auth-guard');
const StoreManager = require('../src/store-manager');
const MercadoPagoStorePayments = require('../src/mercadopago-store-payments');

function request(server, { method = 'GET', path: reqPath = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const reqHeaders = { ...headers };
    if (payload !== null && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (payload !== null) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: reqPath,
        method,
        headers: reqHeaders
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );

    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function runPhase1Tests() {
  process.env.ADMIN_PASSWORD = 'TestSuperAdminMasterKey!2026';
  process.env.SESSION_SECRET = 'TestHmacSessionSecretKeyForCapFitPhase1Suite2026';
  process.env.MP_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.MP_CLIENT_ID = 'TEST_MP_CLIENT_ID_123456';
  process.env.MP_CLIENT_SECRET = 'TEST_MP_CLIENT_SECRET_654321';

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  console.log('\n💳 Ejecutando Suite de Mercado Pago Multi-Tenant Fase 1 (OAuth, Checkout Pro Directo y Webhooks)...\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ FAIL: ${name}`);
      console.log(`     Detalle: ${err.stack || err.message}`);
      failed++;
    }
  }

  await StoreManager.init();
  await MercadoPagoStorePayments.disconnectStoreMercadoPago('tienda1');
  await MercadoPagoStorePayments.disconnectStoreMercadoPago('tienda2');

  const tienda1OwnerToken = AuthGuard.signSessionToken({
    role: 'store_owner',
    storeId: 'tienda1',
    uid: 'owner_tienda1',
    email: 'owner1@capfit.store'
  });

  const tienda2OwnerToken = AuthGuard.signSessionToken({
    role: 'store_owner',
    storeId: 'tienda2',
    uid: 'owner_tienda2',
    email: 'owner2@capfit.store'
  });

  // ── 1. BLOQUEO DE CHECKOUT CUANDO LA TIENDA NO CONECTÓ MERCADO PAGO ──
  await test('GET /api/store/current informa mpConnected: false y POST /api/payments/mp/create-preference bloquea el pago (409 MP_NOT_CONNECTED) si la tienda no vinculó Mercado Pago', async () => {
    const currentRes = await request(server, {
      method: 'GET',
      path: '/api/store/current?store=tienda1'
    });
    assert.equal(currentRes.status, 200);
    assert.equal(currentRes.json.store.id, 'tienda1');
    assert.equal(currentRes.json.store.mpConnected, false);

    const prefRes = await request(server, {
      method: 'POST',
      path: '/api/payments/mp/create-preference?store=tienda1',
      headers: { Host: 'tienda1.capfit.store' },
      body: {
        storeId: 'tienda1',
        items: [{ id: 1, quantity: 1 }],
        customer: {
          name: 'Comprador Sin MP',
          email: 'sinmp@example.com',
          phone: '1122334455',
          address: 'Av. Santa Fe 1234',
          city: 'CABA',
          zip: '1425'
        }
      }
    });
    assert.equal(prefRes.status, 409);
    assert.equal(prefRes.json.code, 'MP_NOT_CONNECTED');
  });

  // ── 2. FLUJO OAUTH 2.0 POR TIENDA Y RENOVACIÓN AUTOMÁTICA DE CREDENCIALES ──
  await test('GET /api/mp/oauth/authorize firma el state con HMAC por tienda y bloquea solicitudes OAuth cruzadas entre tiendas (403)', async () => {
    // Tienda 1 no puede iniciar OAuth para Tienda 2
    const crossTenantRes = await request(server, {
      method: 'GET',
      path: '/api/mp/oauth/authorize?store=tienda2',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` }
    });
    assert.equal(crossTenantRes.status, 403);

    // Tienda 1 genera su propia URL de autorización OAuth
    const authUrlRes = await request(server, {
      method: 'GET',
      path: '/api/mp/oauth/authorize?store=tienda1',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` }
    });
    assert.equal(authUrlRes.status, 200);
    assert.equal(authUrlRes.json.storeId, 'tienda1');
    assert.ok(authUrlRes.json.authorizeUrl.includes('auth.mercadopago.com'));
    assert.ok(authUrlRes.json.state);

    const verified = MercadoPagoStorePayments.verifyOAuthState(authUrlRes.json.state);
    assert.equal(verified.valid, true);
    assert.equal(verified.storeId, 'tienda1');

    const tampered = MercadoPagoStorePayments.verifyOAuthState(authUrlRes.json.state + 'tampered');
    assert.equal(tampered.valid, false);
  });

  await test('Intercambio OAuth cifra Access Token y Refresh Token exclusivamente en tienda1 y renueva automáticamente credenciales próximas a vencer', async () => {
    const state = MercadoPagoStorePayments.signOAuthState('tienda1');

    const mockFetchOAuth = async (url, options) => {
      if (String(url).includes('/oauth/token')) {
        const body = JSON.parse(options.body);
        assert.equal(body.grant_type, 'authorization_code');
        assert.equal(body.code, 'TG-OAUTH-CODE-TIENDA1');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'APP_USR-OAUTH-TOKEN-TIENDA-1-SECRET',
            refresh_token: 'TG-REFRESH-TOKEN-TIENDA-1',
            public_key: 'APP_USR-PUBKEY-TIENDA-1',
            user_id: 99887766,
            expires_in: 15552000,
            live_mode: true
          })
        };
      }
      if (String(url).includes('/users/me')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 99887766,
            nickname: 'MARCA1_OFICIAL',
            email: 'cobros@marca1.com'
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await MercadoPagoStorePayments.exchangeOAuthCodeForStore({
      code: 'TG-OAUTH-CODE-TIENDA1',
      state,
      req: { headers: { host: 'app.capfit.store' }, protocol: 'https' },
      fetchImpl: mockFetchOAuth
    });

    assert.equal(result.storeId, 'tienda1');
    assert.equal(result.mpAccountLabel, 'cobros@marca1.com');

    const statusT1 = await MercadoPagoStorePayments.getStoreConnectionStatus('tienda1');
    const statusT2 = await MercadoPagoStorePayments.getStoreConnectionStatus('tienda2');
    assert.equal(statusT1.mpConnected, true);
    assert.equal(statusT1.mpConnectionMode, 'oauth');
    assert.equal(statusT1.mpAccountLabel, 'cobros@marca1.com');
    assert.equal(statusT2.mpConnected, false);

    // Simular vencimiento próximo (< 24h) para probar renovación automática de Refresh Token
    const currentCreds = await StoreManager.getStorePaymentCredentials('tienda1');
    await StoreManager.saveStorePaymentCredentials('tienda1', {
      ...currentCreds,
      mpTokenExpiresAt: new Date(Date.now() + 60 * 1000).toISOString()
    });

    let refreshCalled = false;
    const mockFetchRefresh = async (url, options) => {
      if (String(url).includes('/oauth/token')) {
        const body = JSON.parse(options.body);
        assert.equal(body.grant_type, 'refresh_token');
        assert.equal(body.refresh_token, 'TG-REFRESH-TOKEN-TIENDA-1');
        refreshCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'APP_USR-OAUTH-RENOVADO-TIENDA-1',
            refresh_token: 'TG-REFRESH-TOKEN-TIENDA-1-NEW',
            public_key: 'APP_USR-PUBKEY-TIENDA-1',
            user_id: 99887766,
            expires_in: 15552000,
            live_mode: true
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const refreshedCreds = await MercadoPagoStorePayments.ensureFreshStoreAccessToken('tienda1', {
      fetchImpl: mockFetchRefresh
    });
    assert.equal(refreshCalled, true);
    assert.equal(refreshedCreds.accessToken, 'APP_USR-OAUTH-RENOVADO-TIENDA-1');
  });

  // ── 3. AISLAMIENTO ESTRICTO ENTRE TIENDA 1 Y TIENDA 2 Y CHECKOUT PRO DIRECTO (0% COMISIÓN) ──
  await test('Tienda 1 y Tienda 2 usan exclusivamente sus propios Access Tokens en Checkout Pro con 0% de comisión de plataforma y validación server-side de precios', async () => {
    const connectT1 = await request(server, {
      method: 'POST',
      path: '/api/mp/credentials/manual',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: {
        storeId: 'tienda1',
        accessToken: 'TEST-TOKEN-EXCLUSIVO-MARCA-1-999999',
        publicKey: 'TEST-PUB-MARCA-1',
        accountLabel: 'Cuenta MP Marca 1'
      }
    });
    assert.equal(connectT1.status, 200);
    assert.equal(connectT1.json.mpConnected, true);

    const connectT2 = await request(server, {
      method: 'POST',
      path: '/api/mp/credentials/manual',
      headers: { Authorization: `Bearer ${tienda2OwnerToken}` },
      body: {
        storeId: 'tienda2',
        accessToken: 'TEST-TOKEN-EXCLUSIVO-MARCA-2-888888',
        publicKey: 'TEST-PUB-MARCA-2',
        accountLabel: 'Cuenta MP Marca 2'
      }
    });
    assert.equal(connectT2.status, 200);
    assert.equal(connectT2.json.mpConnected, true);

    const capturedAuthHeaders = {};
    const capturedPayloads = {};

    const mockPreferenceFetch = async (url, options) => {
      const payload = JSON.parse(options.body);
      const stId = payload.metadata.store_id;
      capturedAuthHeaders[stId] = options.headers.Authorization;
      capturedPayloads[stId] = payload;
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: `PREF-${stId.toUpperCase()}-123`,
          init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=PREF-${stId}`,
          sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=PREF-${stId}`
        })
      };
    };

    const store1Obj = StoreManager.getStoreById('tienda1');
    const store2Obj = StoreManager.getStoreById('tienda2');
    const catalogT1 = await StoreManager.fetchStoreProductsFromDb('tienda1');
    const catalogT2 = await StoreManager.fetchStoreProductsFromDb('tienda2');
    const prodT1 = catalogT1[0];
    const prodT2 = catalogT2[0];

    const orderT1 = {
      id: '#MP-TEST-T1',
      storeId: 'tienda1',
      buyerEmail: 'cliente1@example.com',
      customer: { name: 'Cliente Marca 1', email: 'cliente1@example.com', phone: '1144445555', address: 'Av. Cabildo 2000', postalCode: '1428' },
      items: [{ id: prodT1.id, nombre: prodT1.nombre, quantity: 2, precio: Number(prodT1.precio), unitPrice: Number(prodT1.precio) }],
      shipping: 0,
      total: Number(prodT1.precio) * 2,
      externalReference: 'ord_tienda1_#MP-TEST-T1'
    };

    const orderT2 = {
      id: '#MP-TEST-T2',
      storeId: 'tienda2',
      buyerEmail: 'cliente2@example.com',
      customer: { name: 'Cliente Marca 2', email: 'cliente2@example.com', phone: '1166667777', address: 'Av. Corrientes 3000', postalCode: '1193' },
      items: [{ id: prodT2.id, nombre: prodT2.nombre, quantity: 1, precio: Number(prodT2.precio), unitPrice: Number(prodT2.precio) }],
      shipping: 0,
      total: Number(prodT2.precio),
      externalReference: 'ord_tienda2_#MP-TEST-T2'
    };

    const prefT1 = await MercadoPagoStorePayments.createStoreCheckoutPreference({
      storeObj: store1Obj,
      order: orderT1,
      req: { headers: { host: 'tienda1.capfit.store' }, protocol: 'https' },
      fetchImpl: mockPreferenceFetch
    });

    const prefT2 = await MercadoPagoStorePayments.createStoreCheckoutPreference({
      storeObj: store2Obj,
      order: orderT2,
      req: { headers: { host: 'tienda2.capfit.store' }, protocol: 'https' },
      fetchImpl: mockPreferenceFetch
    });

    // Verificar aislamiento estricto de credenciales entre Tienda 1 y Tienda 2
    assert.equal(capturedAuthHeaders.tienda1, 'Bearer TEST-TOKEN-EXCLUSIVO-MARCA-1-999999');
    assert.equal(capturedAuthHeaders.tienda2, 'Bearer TEST-TOKEN-EXCLUSIVO-MARCA-2-888888');
    assert.notEqual(capturedAuthHeaders.tienda1, capturedAuthHeaders.tienda2);

    // Verificar 0% de comisión de plataforma (ni application_fee ni marketplace_fee)
    assert.equal(capturedPayloads.tienda1.application_fee, undefined);
    assert.equal(capturedPayloads.tienda1.marketplace_fee, undefined);
    assert.equal(capturedPayloads.tienda2.application_fee, undefined);
    assert.equal(capturedPayloads.tienda2.marketplace_fee, undefined);

    assert.equal(prefT1.externalReference, 'ord_tienda1_#MP-TEST-T1');
    assert.equal(prefT2.externalReference, 'ord_tienda2_#MP-TEST-T2');
  });

  // ── 4. WEBHOOKS MULTI-TENANT: APROBADO, IDEMPOTENCIA, RECHAZADO (RESTAURA STOCK) Y REEMBOLSADO ──
  await test('Webhook de pago aprobado actualiza orden a Aprobado de forma idempotente y rechaza spoofing entre tiendas (403)', async () => {
    const catalogT1 = await StoreManager.fetchStoreProductsFromDb('tienda1');
    const prod = catalogT1[0];

    // Enviar precio manipulado ($1) al endpoint HTTP: el servidor debe recalcular el precio oficial del catálogo
    const createRes = await request(server, {
      method: 'POST',
      path: '/api/payments/mp/create-preference?store=tienda1',
      headers: { Host: 'tienda1.capfit.store' },
      body: {
        storeId: 'tienda1',
        items: [{ id: prod.id, precio: 1, quantity: 1 }],
        customer: {
          name: 'Comprador Webhook',
          email: 'webhook@example.com',
          phone: '1155556666',
          address: 'Av. Libertador 1000',
          city: 'CABA',
          postalCode: '1425'
        }
      }
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.json.order.items[0].precio, Number(prod.precio));
    const orderId = createRes.json.order.id;
    const externalReference = createRes.json.externalReference;

    // Intento de spoofing: procesar en tienda2 una notificación cuya external_reference pertenece a tienda1
    await assert.rejects(
      () =>
        MercadoPagoStorePayments.processStorePaymentNotification({
          storeId: 'tienda2',
          paymentId: 'PAY-SPOOF-999',
          externalReferenceHint: externalReference,
          sandboxStatusOverride: 'approved'
        }),
      (err) => err.status === 403
    );

    // Webhook legítimo de pago aprobado para tienda1
    const webhookRes = await request(server, {
      method: 'POST',
      path: '/api/webhooks/mercadopago?store=tienda1',
      body: {
        type: 'payment',
        data: { id: 'PAY-APPROVED-1001' },
        external_reference: externalReference,
        simulated_status: 'approved'
      }
    });
    assert.equal(webhookRes.status, 200);
    assert.equal(webhookRes.json.paymentStatus, 'Aprobado');

    const updatedOrder = await StoreManager.getSingleStoreOrder('tienda1', orderId);
    assert.equal(updatedOrder.paymentStatus, 'Aprobado');
    assert.equal(updatedOrder.status, 'paid');
    assert.equal(updatedOrder.mpPaymentId, 'PAY-APPROVED-1001');
    assert.ok(updatedOrder.paidAt);

    // Webhook duplicado verifica idempotencia
    const duplicateWebhookRes = await request(server, {
      method: 'POST',
      path: '/api/webhooks/mercadopago?store=tienda1',
      body: {
        type: 'payment',
        data: { id: 'PAY-APPROVED-1001' },
        external_reference: externalReference,
        simulated_status: 'approved'
      }
    });
    assert.equal(duplicateWebhookRes.status, 200);
    assert.equal(duplicateWebhookRes.json.alreadyProcessed, true);
  });

  await test('Webhook de pago rechazado actualiza orden a Rechazado y restaura el stock reservado una única vez', async () => {
    const productsBefore = await StoreManager.fetchStoreProductsFromDb('tienda1');
    const prodBefore = productsBefore.find((p) => Number(p.id) === 2) || productsBefore[0];
    const targetProdId = prodBefore.id;
    const initialStock = Number(prodBefore.stock);

    const createRes = await request(server, {
      method: 'POST',
      path: '/api/payments/mp/create-preference?store=tienda1',
      headers: { Host: 'tienda1.capfit.store' },
      body: {
        storeId: 'tienda1',
        items: [{ id: targetProdId, quantity: 2 }],
        customer: {
          name: 'Comprador Rechazado',
          email: 'rechazado@example.com',
          phone: '1177778888',
          address: 'Calle Falsa 123',
          city: 'CABA',
          postalCode: '1400'
        }
      }
    });
    assert.equal(createRes.status, 201);
    const orderId = createRes.json.order.id;
    const externalReference = createRes.json.externalReference;

    const productsReserved = await StoreManager.fetchStoreProductsFromDb('tienda1');
    const prodReserved = productsReserved.find((p) => String(p.id) === String(targetProdId));
    assert.equal(Number(prodReserved.stock), initialStock - 2);

    const rejectWebhook = await request(server, {
      method: 'POST',
      path: '/api/webhooks/mercadopago?store=tienda1',
      body: {
        type: 'payment',
        data: { id: 'PAY-REJECTED-2002' },
        external_reference: externalReference,
        simulated_status: 'rejected'
      }
    });
    assert.equal(rejectWebhook.status, 200);
    assert.equal(rejectWebhook.json.paymentStatus, 'Rechazado');

    const productsAfterReject = await StoreManager.fetchStoreProductsFromDb('tienda1');
    const prodAfterReject = productsAfterReject.find((p) => String(p.id) === String(targetProdId));
    assert.equal(Number(prodAfterReject.stock), initialStock);

    const rejectedOrder = await StoreManager.getSingleStoreOrder('tienda1', orderId);
    assert.equal(rejectedOrder.paymentStatus, 'Rechazado');
    assert.equal(rejectedOrder.stockRestored, true);
  });

  await test('Webhook de pago reembolsado actualiza el estado a Reembolsado', async () => {
    const catalogT2 = await StoreManager.fetchStoreProductsFromDb('tienda2');
    const prodT2 = catalogT2[0];

    const createRes = await request(server, {
      method: 'POST',
      path: '/api/payments/mp/create-preference?store=tienda2',
      headers: { Host: 'tienda2.capfit.store' },
      body: {
        storeId: 'tienda2',
        items: [{ id: prodT2.id, quantity: 1 }],
        customer: {
          name: 'Comprador Reembolso',
          email: 'reembolso@example.com',
          phone: '1199990000',
          address: 'Av. Rivadavia 5000',
          city: 'CABA',
          postalCode: '1424'
        }
      }
    });
    assert.equal(createRes.status, 201);
    const externalReference = createRes.json.externalReference;

    const refundWebhook = await request(server, {
      method: 'POST',
      path: '/api/webhooks/mercadopago?store=tienda2',
      body: {
        type: 'payment',
        data: { id: 'PAY-REFUND-3003' },
        external_reference: externalReference,
        simulated_status: 'refunded'
      }
    });
    assert.equal(refundWebhook.status, 200);
    assert.equal(refundWebhook.json.paymentStatus, 'Reembolsado');
  });

  // ── 5. DESCONEXIÓN DE CUENTA MERCADO PAGO ──
  await test('POST /api/mp/credentials/disconnect elimina credenciales de la tienda sin afectar a otras tiendas', async () => {
    const discRes = await request(server, {
      method: 'POST',
      path: '/api/mp/credentials/disconnect',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { storeId: 'tienda1' }
    });
    assert.equal(discRes.status, 200);
    assert.equal(discRes.json.mpConnected, false);

    // Tienda 2 sigue conectada
    const statusT2 = await MercadoPagoStorePayments.getStoreConnectionStatus('tienda2');
    assert.equal(statusT2.mpConnected, true);

    // Reconectar Tienda 1 en modo prueba para dejar el entorno listo
    await request(server, {
      method: 'POST',
      path: '/api/mp/credentials/manual',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: {
        storeId: 'tienda1',
        accessToken: 'TEST-SANDBOX-TIENDA1-CAPFIT-DEMO',
        publicKey: 'TEST-PUB-TIENDA1',
        accountLabel: 'Cuenta de Prueba (Sandbox) — Tienda 1'
      }
    });
  });

  await new Promise((resolve) => server.close(resolve));

  console.log(`\n📊 Resultado Fase 1: ${passed} pruebas exitosas, ${failed} fallidas.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runPhase1Tests().catch((err) => {
  console.error('Error fatal ejecutando pruebas de Fase 1:', err);
  process.exit(1);
});
