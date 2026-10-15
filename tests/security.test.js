/**
 * CAPFIT — Suite de Pruebas de Seguridad, Autorización Multi-Tienda e Integridad Financiera
 *
 * Verifica:
 * 1. Rechazo de peticiones sin autenticación (401) en endpoints administrativos, financieros, de pedidos y de clientes.
 * 2. Eliminación de contraseñas de prueba cableadas (123456, tienda1pass, tienda2pass) y rechazo de tokens planos falsificados.
 * 3. Aislamiento estricto entre tiendas (403): el dueño de tienda1 no puede administrar productos, secciones, pedidos ni suscripciones de tienda2.
 * 4. Protección financiera: bloqueo de /api/subscriptions/simulate-approval en producción y prohibición de auto-asignación de planes/cuotas vía PUT /api/admin/stores/:id.
 * 5. Integridad de pedidos en checkout público (POST /api/orders): fuerza paymentStatus = 'Pendiente' y recalcula precios reales desde el catálogo de la tienda.
 */

const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../server');
const AuthGuard = require('../src/auth-guard');

function request(server, { method = 'GET', path = '/', headers = {}, body = null }) {
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
        path,
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

async function runTests() {
  // Configurar secreto maestro controlado para las pruebas
  process.env.ADMIN_PASSWORD = 'TestSuperAdminMasterKey!2026';
  process.env.SESSION_SECRET = 'TestHmacSessionSecretKeyForCapFitSecuritySuite2026';

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     ${err.stack || err.message}`);
      failed++;
    }
  }

  console.log('\n🔒 Ejecutando Suite de Seguridad y Autorización Multi-Tenant de CapFit...\n');

  // Emitir tokens firmados con HMAC para las pruebas de roles
  const tienda1OwnerToken = AuthGuard.signSessionToken({
    role: 'store_owner',
    storeId: 'tienda1',
    uid: 'owner_tienda1',
    email: 'dueno1@tienda1.com'
  });

  const superAdminToken = AuthGuard.signSessionToken({
    role: 'superadmin',
    storeId: 'principal',
    uid: 'superadmin',
    email: 'admin@capfit.store'
  });

  // ── 1. RECHAZO DE CONTRASEÑAS DE PRUEBA Y TOKENS FALSIFICADOS ──
  await test('Rechaza contraseñas de prueba eliminadas (123456, tienda1pass, tienda2pass, capfit2026)', async () => {
    for (const badPass of ['123456', 'tienda1pass', 'tienda2pass', 'capfit2026']) {
      const res = await request(server, {
        method: 'POST',
        path: '/api/admin/login',
        body: { username: 'admin_tienda1', password: badPass, storeId: 'tienda1' }
      });
      assert.equal(res.status, 401, `Se esperaba 401 para contraseña "${badPass}", recibido ${res.status}`);
    }
  });

  await test('Emite token firmado con HMAC-SHA256 al autenticar SuperAdmin con ADMIN_PASSWORD válido', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/admin/login',
      body: { username: 'superadmin', password: process.env.ADMIN_PASSWORD }
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.role, 'superadmin');
    assert.ok(res.json.token && res.json.token.startsWith('capfit_sess.'), 'El token debe tener prefijo y firma HMAC');
  });

  await test('Rechaza tokens planos falsificados de sessionStorage (ej. capfit_store_tienda1_12345)', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/admin/products?store=tienda1',
      headers: { Authorization: 'Bearer capfit_store_tienda1_999999' },
      body: { nombre: 'Gorra Intruso', precio: 15000 }
    });
    assert.equal(res.status, 401);
  });

  // ── 2. RECHAZO DE PETICIONES ANÓNIMAS (401 UNAUTHORIZED) ──
  await test('Rechaza peticiones sin autenticación (401) en endpoints administrativos de productos y tiendas', async () => {
    const createProd = await request(server, {
      method: 'POST',
      path: '/api/admin/products?store=tienda1',
      body: { nombre: 'Gorra Anónima', precio: 10000 }
    });
    assert.equal(createProd.status, 401);

    const updateStore = await request(server, {
      method: 'PUT',
      path: '/api/admin/stores/tienda1',
      body: { name: 'Tienda Hackeada' }
    });
    assert.equal(updateStore.status, 401);

    const listStores = await request(server, {
      method: 'GET',
      path: '/api/admin/stores'
    });
    assert.equal(listStores.status, 401);

    const updateSections = await request(server, {
      method: 'PUT',
      path: '/api/stores/tienda1/sections',
      body: { sectionKey: 'home', data: { heroTitle: 'Hack' } }
    });
    assert.equal(updateSections.status, 401);
  });

  await test('Rechaza peticiones sin autenticación (401) en lectura/edición de órdenes y perfil de comprador', async () => {
    const getOrders = await request(server, {
      method: 'GET',
      path: '/api/orders?store=tienda1'
    });
    assert.equal(getOrders.status, 401);

    const updateOrder = await request(server, {
      method: 'PUT',
      path: '/api/orders/ORD-101?store=tienda1',
      body: { paymentStatus: 'Aprobado' }
    });
    assert.equal(updateOrder.status, 401);

    const customerOrders = await request(server, {
      method: 'GET',
      path: '/api/customer/orders?uid=victim_uid&email=victim@gmail.com'
    });
    assert.equal(customerOrders.status, 401);

    const customerProfile = await request(server, {
      method: 'PUT',
      path: '/api/customer/profile',
      body: { uid: 'victim_uid', phone: '123456' }
    });
    assert.equal(customerProfile.status, 401);
  });

  // ── 3. AISLAMIENTO ENTRE TIENDAS (403 FORBIDDEN CROSS-TENANT) ──
  await test('Impide que el dueño de tienda1 administre productos, secciones o pedidos de tienda2 (403 Forbidden)', async () => {
    const crossProduct = await request(server, {
      method: 'POST',
      path: '/api/admin/products?store=tienda2',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { nombre: 'Producto Cruzado', precio: 25000 }
    });
    assert.equal(crossProduct.status, 403);

    const crossSection = await request(server, {
      method: 'PUT',
      path: '/api/stores/tienda2/sections',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { sectionKey: 'home', data: { heroTitle: 'Modificado desde tienda1' } }
    });
    assert.equal(crossSection.status, 403);

    const crossOrdersRead = await request(server, {
      method: 'GET',
      path: '/api/orders?store=tienda2',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` }
    });
    assert.equal(crossOrdersRead.status, 403);

    const crossCancelSub = await request(server, {
      method: 'POST',
      path: '/api/subscriptions/cancel',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { storeId: 'tienda2' }
    });
    assert.equal(crossCancelSub.status, 403);
  });

  await test('Permite al dueño de tienda1 leer sus propios pedidos y actualizar metadatos no financieros de tienda1', async () => {
    const ownOrders = await request(server, {
      method: 'GET',
      path: '/api/orders?store=tienda1',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` }
    });
    assert.equal(ownOrders.status, 200);
    assert.ok(Array.isArray(ownOrders.json));

    const ownMetadataUpdate = await request(server, {
      method: 'PUT',
      path: '/api/admin/stores/tienda1',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { tagline: 'Nueva descripción oficial de Tienda 1' }
    });
    assert.equal(ownMetadataUpdate.status, 200);
    assert.equal(ownMetadataUpdate.json.ok, true);
  });

  // ── 4. PROTECCIÓN DE ENDPOINTS FINANCIEROS Y PLANES ──
  await test('Impide que un dueño de tienda se auto-asigne un plan pago o aumente su aiMonthlyLimit vía PUT /api/admin/stores/:id (403)', async () => {
    const selfUpgrade = await request(server, {
      method: 'PUT',
      path: '/api/admin/stores/tienda1',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { plan: 'Enterprise', planId: 'enterprise', aiMonthlyLimit: 5000 }
    });
    assert.equal(selfUpgrade.status, 403);
  });

  await test('Bloquea /api/subscriptions/simulate-approval en modo producción incluso con token válido (403)', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_SUBSCRIPTION_SIMULATION;
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_SUBSCRIPTION_SIMULATION;

    try {
      const simProd = await request(server, {
        method: 'POST',
        path: '/api/subscriptions/simulate-approval',
        headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
        body: { storeId: 'tienda1', planId: 'enterprise' }
      });
      assert.equal(simProd.status, 403);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevAllow !== undefined) process.env.ALLOW_SUBSCRIPTION_SIMULATION = prevAllow;
    }
  });

  await test('Restringe la configuración global de credenciales de Mercado Pago exclusivamente a SuperAdmin (401/403)', async () => {
    const anonConfig = await request(server, {
      method: 'POST',
      path: '/api/admin/subscriptions/config',
      body: { accessToken: 'APP_USR-fake' }
    });
    assert.equal(anonConfig.status, 401);

    const ownerConfig = await request(server, {
      method: 'POST',
      path: '/api/admin/subscriptions/config',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { accessToken: 'APP_USR-fake' }
    });
    assert.equal(ownerConfig.status, 403);

    const ownerTestConn = await request(server, {
      method: 'GET',
      path: '/api/subscriptions/config/test',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` }
    });
    assert.equal(ownerTestConn.status, 403);
  });

  // ── 5. INTEGRIDAD DE PEDIDOS EN CHECKOUT PÚBLICO ──
  await test('POST /api/orders fuerza paymentStatus="Pendiente", ignora precios adulterados y aísla la orden por tienda', async () => {
    // Obtener catálogo de tienda1 para conocer un producto real y su precio oficial
    const prodRes = await request(server, {
      method: 'GET',
      path: '/api/products?store=tienda1'
    });
    assert.equal(prodRes.status, 200);
    const catalogItem = prodRes.json[0];
    assert.ok(catalogItem && catalogItem.precio > 100, 'Debe existir al menos un producto con precio real en tienda1');

    // Un comprador anónimo intenta crear una orden marcada como "Aprobado" y con precio de $1
    const orderRes = await request(server, {
      method: 'POST',
      path: '/api/orders?store=tienda1',
      body: {
        id: '#TEST-SEC-ORDER-1',
        userId: 'spoofed_uid_without_token',
        customer: { name: 'Comprador Test', email: 'test@comprador.com' },
        items: [
          {
            id: catalogItem.id,
            nombre: catalogItem.nombre,
            quantity: 2,
            precio: 1 // Intento de adulteración de precio ($1 en lugar del precio oficial)
          }
        ],
        shipping: 3500,
        subtotal: 2,
        total: 3502,
        status: 'paid',
        paymentStatus: 'Aprobado' // Intento de marcar orden como pagada sin pasarela
      }
    });

    assert.equal(orderRes.status, 201);
    assert.equal(orderRes.json.ok, true);

    const createdOrder = orderRes.json.order;
    assert.equal(createdOrder.paymentStatus, 'Pendiente', 'La orden debe crearse siempre con paymentStatus Pendiente');
    assert.equal(createdOrder.status, 'pending', 'El status interno debe forzarse a pending');
    assert.equal(createdOrder.userId, null, 'No debe permitir asociar un userId sin token de comprador verificado');
    assert.equal(
      createdOrder.subtotal,
      catalogItem.precio * 2,
      `El subtotal debe recalcularse con el precio real del catálogo (${catalogItem.precio * 2}), no con el valor adulterado`
    );
    assert.equal(createdOrder.total, catalogItem.precio * 2 + 3500);

    // Verificar que el dueño de tienda1 puede aprobar su orden, pero no desde otra tienda
    const crossUpdateOrder = await request(server, {
      method: 'PUT',
      path: `/api/orders/${encodeURIComponent(createdOrder.id)}?store=tienda2`,
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { paymentStatus: 'Aprobado' }
    });
    assert.equal(crossUpdateOrder.status, 403);

    const validOwnerUpdate = await request(server, {
      method: 'PUT',
      path: `/api/orders/${encodeURIComponent(createdOrder.id)}?store=tienda1`,
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: { paymentStatus: 'Aprobado', shippingStatus: 'Despachado' }
    });
    assert.equal(validOwnerUpdate.status, 200);
    assert.equal(validOwnerUpdate.json.order.paymentStatus, 'Aprobado');
  });

  await new Promise((resolve) => server.close(resolve));

  console.log(`\n📊 Resultado final: ${passed} pruebas exitosas, ${failed} fallidas.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
