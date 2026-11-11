/**
 * CAPFIT — Suite de Pruebas de Infraestructura Fase 0 (Preparación para Mercado Pago Multi-Tenant)
 *
 * Verifica:
 * 1. Consolidación de Vercel Serverless: único entrypoint `api/serverless.js` y `vercel.json` limpio.
 * 2. Aislamiento estricto por subdominio en `GET /api/products` y `POST /api/orders` (403 Cross-Tenant).
 * 3. Validación de existencia de producto en catálogo, stock disponible y recálculo de precios reales en `POST /api/orders`.
 * 4. Generación exclusiva en servidor del `orderId` (impide sobrescribir órdenes existentes).
 * 5. Fidelidad total de campos en órdenes (`userId`, `buyerEmail`, `shippingTracking`, `notes`, `externalReference`, `paymentStatus: 'Pendiente'`) e idempotencia de actualizaciones.
 * 6. Cifrado `AES-256-GCM` de credenciales de pago por tienda (`store_secrets/{storeId}`) y hashing `scrypt` de contraseñas.
 * 7. Regla de 7 días de período de gracia de suscripción (permite ventas pero bloquea IA en gracia; bloquea ambos tras >7 días de vencimiento).
 * 8. Almacenamiento multi-tenant de imágenes (`POST /api/admin/upload`) aislado bajo `stores/{storeId}/products/{filename}`.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const app = require('../server');
const AuthGuard = require('../src/auth-guard');
const StoreManager = require('../src/store-manager');

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

async function runPhase0Tests() {
  process.env.ADMIN_PASSWORD = 'TestSuperAdminMasterKey!2026';
  process.env.SESSION_SECRET = 'TestHmacSessionSecretKeyForCapFitPhase0Suite2026';
  process.env.MP_TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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

  console.log('\n🏗️  Ejecutando Suite de Infraestructura Fase 0 (CapFit Multi-Tenant Ready)...\n');

  const tienda1OwnerToken = AuthGuard.signSessionToken({
    role: 'store_owner',
    storeId: 'tienda1',
    uid: 'owner_tienda1',
    email: 'dueno1@tienda1.com'
  });

  // ── 1. VERIFICACIÓN DE FUNCIÓN ÚNICA EN VERCEL ──
  await test('Directorio /api contiene únicamente serverless.js y vercel.json compila una sola Serverless Function', async () => {
    const apiDir = path.join(__dirname, '..', 'api');
    const entries = fs.readdirSync(apiDir);
    assert.deepEqual(entries, ['serverless.js'], `Se esperaba solo ['serverless.js'] en /api, encontrado: ${JSON.stringify(entries)}`);

    const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const nodeBuilds = vercelConfig.builds.filter((b) => b.use === '@vercel/node');
    assert.equal(nodeBuilds.length, 1, 'Solo debe existir 1 build @vercel/node en vercel.json');
    assert.equal(nodeBuilds[0].src, 'api/serverless.js');
    assert.equal(nodeBuilds[0].config.maxDuration, 60);
  });

  // ── 2. AISLAMIENTO ESTRICTO POR SUBDOMINIO ──
  await test('Bloquea consultas de catálogo y creación de órdenes cruzadas desde un subdominio dedicado (403)', async () => {
    const crossProducts = await request(server, {
      method: 'GET',
      path: '/api/products?store=tienda2',
      headers: { Host: 'tienda1.capfit.store' }
    });
    assert.equal(crossProducts.status, 403, 'GET /api/products?store=tienda2 desde tienda1.capfit.store debe devolver 403');

    const crossOrder = await request(server, {
      method: 'POST',
      path: '/api/orders?store=tienda2',
      headers: { Host: 'tienda1.capfit.store' },
      body: {
        storeId: 'tienda2',
        items: [{ id: 1, quantity: 1 }]
      }
    });
    assert.equal(crossOrder.status, 403, 'POST /api/orders para tienda2 desde tienda1.capfit.store debe devolver 403');
  });

  // ── 3. VALIDACIÓN DE PRODUCTOS INEXISTENTES Y STOCK EN SERVIDOR ──
  await test('POST /api/orders rechaza productos inexistentes en el catálogo de la tienda (400) y stock insuficiente (400 INSUFFICIENT_STOCK)', async () => {
    const fakeProdRes = await request(server, {
      method: 'POST',
      path: '/api/orders?store=tienda1',
      body: {
        items: [{ id: 999999, nombre: 'Gorra Fantasma', quantity: 1, precio: 10 }]
      }
    });
    assert.equal(fakeProdRes.status, 400);
    assert.match(fakeProdRes.json.error, /no existe en el catálogo oficial/i);

    const prodRes = await request(server, {
      method: 'GET',
      path: '/api/products?store=tienda1'
    });
    const realProduct = prodRes.json[0];
    assert.ok(realProduct);

    const excessStockRes = await request(server, {
      method: 'POST',
      path: '/api/orders?store=tienda1',
      body: {
        items: [{ id: realProduct.id, quantity: 99999 }]
      }
    });
    assert.equal(excessStockRes.status, 400);
    assert.equal(excessStockRes.json.code, 'INSUFFICIENT_STOCK');
  });

  // ── 4. INMUTABILIDAD DE ID DE ORDEN Y FIDELIDAD COMPLETA DE CAMPOS ──
  await test('POST /api/orders genera siempre un orderId único en el servidor y preserva todos los campos de la orden', async () => {
    const prodRes = await request(server, {
      method: 'GET',
      path: '/api/products?store=tienda1'
    });
    const catalogItem = prodRes.json[0];

    const buyerToken = AuthGuard.signSessionToken({
      role: 'customer',
      storeId: 'tienda1',
      uid: 'buyer_uid_phase0',
      email: 'comprador.phase0@gmail.com'
    });

    const firstOrderRes = await request(server, {
      method: 'POST',
      path: '/api/orders?store=tienda1',
      headers: { Authorization: `Bearer ${buyerToken}` },
      body: {
        id: '#CUSTOM-SPOOFED-ID',
        userId: 'buyer_uid_phase0',
        buyerEmail: 'comprador.phase0@gmail.com',
        customer: {
          name: 'Lucía Compradora',
          email: 'comprador.phase0@gmail.com',
          phone: '+54 9 11 5555-4444',
          address: 'Av. Santa Fe 3200',
          city: 'CABA',
          postalCode: '1425'
        },
        shippingTracking: { carrier: 'Correo Argentino' },
        notes: 'Entregar en portería',
        items: [{ id: catalogItem.id, quantity: 1 }]
      }
    });

    assert.equal(firstOrderRes.status, 201);
    const order1 = firstOrderRes.json.order;
    assert.notEqual(order1.id, '#CUSTOM-SPOOFED-ID', 'El servidor no debe aceptar un orderId arbitrario enviado por el cliente');
    assert.ok(order1.id.startsWith('#MP-'), 'El orderId debe generarse en el servidor con formato #MP-...');
    assert.equal(order1.userId, 'buyer_uid_phase0');
    assert.equal(order1.buyerEmail, 'comprador.phase0@gmail.com');
    assert.equal(order1.notes, 'Entregar en portería');
    assert.equal(order1.shippingTracking.carrier, 'Correo Argentino');
    assert.equal(order1.paymentStatus, 'Pendiente');
    assert.ok(order1.externalReference.startsWith(`ord_tienda1_${order1.id}`));

    // Verificar lectura completa desde GET /api/orders
    const listOrdersRes = await request(server, {
      method: 'GET',
      path: '/api/orders?store=tienda1',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` }
    });
    assert.equal(listOrdersRes.status, 200);
    const persisted = listOrdersRes.json.find((o) => o.id === order1.id);
    assert.ok(persisted, 'La orden recién creada debe recuperarse íntegramente');
    assert.equal(persisted.userId, 'buyer_uid_phase0');
    assert.equal(persisted.buyerEmail, 'comprador.phase0@gmail.com');
    assert.equal(persisted.notes, 'Entregar en portería');
    assert.equal(persisted.shippingTracking.carrier, 'Correo Argentino');
    assert.equal(persisted.paymentStatus, 'Pendiente');
  });

  // ── 5. CIFRADO AES-256-GCM DE CREDENCIALES MP Y HASHING SCRYPT DE CONTRASEÑAS ──
  await test('Cifra y descifra credenciales OAuth de Mercado Pago con AES-256-GCM por tienda sin fugas en texto plano', async () => {
    const rawAccessToken = 'APP_USR-9988776655443322-041111-secret-seller-token-tienda1';
    const rawRefreshToken = 'TG-67890abcdef-refresh-token-tienda1';

    await StoreManager.saveStorePaymentCredentials('tienda1', {
      mpConnected: true,
      mpUserId: '192837465',
      mpPublicKey: 'APP_USR-public-key-tienda1',
      accessToken: rawAccessToken,
      refreshToken: rawRefreshToken,
      mpTokenExpiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
      mpConnectionMode: 'oauth'
    });

    const decrypted = await StoreManager.getStorePaymentCredentials('tienda1');
    assert.ok(decrypted);
    assert.equal(decrypted.mpConnected, true);
    assert.equal(decrypted.mpUserId, '192837465');
    assert.equal(decrypted.accessToken, rawAccessToken);
    assert.equal(decrypted.refreshToken, rawRefreshToken);

    // Verificar que el objeto público de la tienda jamás exponga tokens
    const publicStore = StoreManager.getStoreById('tienda1');
    assert.equal(publicStore.accessToken, undefined);
    assert.equal(publicStore.mpAccessTokenEncrypted, undefined);

    // Desconectar credenciales y verificar limpieza
    await StoreManager.clearStorePaymentCredentials('tienda1');
    const afterDisconnect = await StoreManager.getStorePaymentCredentials('tienda1');
    assert.equal(afterDisconnect, null, 'Tras desconectar credenciales no debe quedar ningún secreto activo en memoria ni BD');
  });

  await test('Almacena y verifica contraseñas de administradores de tienda con scrypt + timingSafeEqual', async () => {
    const passwordHash = AuthGuard.hashPassword('MiClaveSeguraTienda1!2026');
    assert.ok(passwordHash.startsWith('scrypt_v1:'), 'El hash debe utilizar formato scrypt_v1:<salt>:<hash>');
    assert.equal(AuthGuard.verifyPasswordHash('MiClaveSeguraTienda1!2026', passwordHash), true);
    assert.equal(AuthGuard.verifyPasswordHash('ClaveIncorrecta', passwordHash), false);
  });

  // ── 6. REGLAS DE 7 DÍAS DE GRACIA DE SUSCRIPCIÓN ──
  await test('Aplica el período de gracia de 7 días: permite órdenes pero bloquea IA en gracia (<=7d), y suspende todo tras >7 días', async () => {
    const origStore = StoreManager.getStoreById('tienda1');
    const origStatus = origStore.subscriptionStatus || 'active';
    const origExpires = origStore.subscriptionExpiresAt || null;

    try {
      // Caso A: Suscripción vencida hace 3 días (dentro de los 7 días de gracia)
      StoreManager.updateStore('tienda1', {
        subscriptionStatus: 'past_due',
        subscriptionExpiresAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      });

      const graceAccess = StoreManager.getStoreSubscriptionAccess('tienda1');
      assert.equal(graceAccess.status, 'grace_period');
      assert.equal(graceAccess.canReceiveOrders, true, 'Durante los 7 días de gracia la tienda puede seguir recibiendo órdenes');
      assert.equal(graceAccess.canUseAiTryOn, false, 'Durante los 7 días de gracia el probador IA debe bloquearse');

      const aiCheckGrace = await StoreManager.checkAndDeductAiCredit('tienda1');
      assert.equal(aiCheckGrace.allowed, false);
      assert.equal(aiCheckGrace.code, 'SUBSCRIPTION_IN_GRACE_PERIOD');

      // Caso B: Suscripción vencida hace 10 días (suspendida >7 días)
      StoreManager.updateStore('tienda1', {
        subscriptionStatus: 'expired',
        subscriptionExpiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      });

      const suspendedAccess = StoreManager.getStoreSubscriptionAccess('tienda1');
      assert.equal(suspendedAccess.status, 'suspended');
      assert.equal(suspendedAccess.canReceiveOrders, false, 'Tras superar los 7 días de gracia no debe permitir nuevas órdenes');
      assert.equal(suspendedAccess.canUseAiTryOn, false);

      const prodRes = await request(server, {
        method: 'GET',
        path: '/api/products?store=tienda1'
      });
      const catalogItem = prodRes.json[0];

      const blockedOrderRes = await request(server, {
        method: 'POST',
        path: '/api/orders?store=tienda1',
        body: {
          items: [{ id: catalogItem.id, quantity: 1 }]
        }
      });
      assert.equal(blockedOrderRes.status, 403);
      assert.equal(blockedOrderRes.json.code, 'STORE_SUSPENDED');
    } finally {
      StoreManager.updateStore('tienda1', {
        subscriptionStatus: origStatus,
        subscriptionExpiresAt: origExpires
      });
    }
  });

  // ── 7. SUBIDA PERSISTENTE MULTI-TENANT DE IMÁGENES ──
  await test('POST /api/admin/upload aísla la ruta bajo stores/{storeId}/products/ y bloquea subidas cruzadas (403)', async () => {
    const tinyWebpBase64 = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

    // Intento cruzado: dueño de tienda1 intentando subir en tienda2
    const crossUpload = await request(server, {
      method: 'POST',
      path: '/api/admin/upload?store=tienda2',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: {
        storeId: 'tienda2',
        filename: 'gorra_intrusa.webp',
        base64: tinyWebpBase64
      }
    });
    assert.equal(crossUpload.status, 403);

    // Subida legítima en su propia tienda (tienda1)
    const ownUpload = await request(server, {
      method: 'POST',
      path: '/api/admin/upload?store=tienda1',
      headers: { Authorization: `Bearer ${tienda1OwnerToken}` },
      body: {
        storeId: 'tienda1',
        filename: 'gorra_test_fase0.webp',
        base64: tinyWebpBase64
      }
    });
    assert.equal(ownUpload.status, 200);
    assert.equal(ownUpload.json.ok, true);
    assert.equal(ownUpload.json.storeId, 'tienda1');
    assert.ok(
      ownUpload.json.path.startsWith('stores/tienda1/products/tienda1_gorra_test_fase0_'),
      `La ruta lógica debe estar aislada bajo stores/tienda1/products/, recibido: ${ownUpload.json.path}`
    );
    assert.ok(ownUpload.json.url, 'Debe devolver una URL válida para el catálogo');
  });

  await new Promise((resolve) => server.close(resolve));

  console.log(`\n📊 Resultado Fase 0: ${passed} pruebas exitosas, ${failed} fallidas.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runPhase0Tests().catch((err) => {
  console.error('Error fatal ejecutando pruebas de Fase 0:', err);
  process.exit(1);
});
