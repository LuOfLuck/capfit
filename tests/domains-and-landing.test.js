/**
 * CAPFIT — Pruebas de Separación de Landing Comercial y Enrutamiento Multi-Tenant por Dominio
 *
 * Verifica:
 * 1. "www.capfit.store" -> Sirve exclusivamente la landing comercial (/landing/index.html)
 * 2. "capfit.store" -> Sirve exclusivamente los archivos de la landing comercial (/landing/index.html)
 * 3. "/landing" -> Permite visualizar la landing en entornos locales y de desarrollo
 * 4. "app.capfit.store" -> Sirve la aplicación principal (/index.html), incluyendo la tienda demo (principal)
 * 5. Subdominios de clientes (*.capfit.store) -> Continúan resolviendo su tienda aislada vía Firestore/StoreManager
 */

const http = require('http');
const assert = require('assert');
const appHandler = require('../server');

function makeRequest(server, options) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runDomainTests() {
  console.log('🌐 Ejecutando Pruebas de Enrutamiento y Separación de Landing Comercial...\n');

  const server = http.createServer(appHandler);
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
      console.error('    Error:', err.message);
      failed++;
    }
  }

  // 1. www.capfit.store -> Sirve directamente la landing comercial (200 OK)
  await test('www.capfit.store sirve directamente la landing comercial', async () => {
    const res = await makeRequest(server, {
      path: '/',
      headers: { host: 'www.capfit.store' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('LANDING COMERCIAL (capfit.store)'), 'Debe contener el marcador de la landing');
    assert.ok(res.body.includes('https://app.capfit.store/'), 'Debe contener el enlace a app.capfit.store');
  });

  await test('www.capfit.store sirve hojas de estilo de landing/css/landing.css', async () => {
    const res = await makeRequest(server, {
      path: '/css/landing.css',
      headers: { host: 'www.capfit.store' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('Landing Comercial de CapFit'), 'Debe servir landing.css');
  });

  // 2. capfit.store -> Landing comercial (/landing/index.html)
  await test('capfit.store sirve los archivos separados de la landing comercial', async () => {
    const res = await makeRequest(server, {
      path: '/',
      headers: { host: 'capfit.store' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('LANDING COMERCIAL (capfit.store)'), 'Debe contener el marcador de la landing');
    assert.ok(res.body.includes('https://app.capfit.store/'), 'Debe contener el enlace a app.capfit.store');
  });

  await test('capfit.store sirve hojas de estilo de landing/css/landing.css', async () => {
    const res = await makeRequest(server, {
      path: '/css/landing.css',
      headers: { host: 'capfit.store' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('Landing Comercial de CapFit'), 'Debe servir landing.css');
  });

  // 3. /landing -> Acceso directo para desarrollo
  await test('/landing sirve la landing en entornos locales o de previsualización', async () => {
    const res = await makeRequest(server, {
      path: '/landing',
      headers: { host: 'localhost:3000' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('LANDING COMERCIAL (capfit.store)'));
  });

  // 4. app.capfit.store -> Aplicación principal y tienda demo
  await test('app.capfit.store sirve la aplicación actual (index.html)', async () => {
    const res = await makeRequest(server, {
      path: '/',
      headers: { host: 'app.capfit.store' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('CapFit'), 'Debe servir la app');
    assert.ok(!res.body.includes('LANDING COMERCIAL (capfit.store)'), 'No debe servir la landing');
  });

  await test('app.capfit.store resuelve la tienda demo "principal"', async () => {
    const res = await makeRequest(server, {
      path: '/api/store/current',
      headers: { host: 'app.capfit.store' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.store.id, 'principal');
  });

  // 5. Subdominios de clientes continúan funcionando exactamente como antes
  await test('Subdominio de cliente (ej. tienda1.capfit.store) sirve la aplicación y resuelve tienda1', async () => {
    const appRes = await makeRequest(server, {
      path: '/',
      headers: { host: 'tienda1.capfit.store' }
    });
    assert.equal(appRes.status, 200);
    assert.ok(!appRes.body.includes('LANDING COMERCIAL (capfit.store)'), 'La tienda de cliente no debe ver la landing');

    const apiRes = await makeRequest(server, {
      path: '/api/store/current',
      headers: { host: 'tienda1.capfit.store' }
    });
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.json.ok, true);
    assert.equal(apiRes.json.store.id, 'tienda1');
  });

  // 6. Verificación de Google Analytics 4 (GA4)
  await test('Endpoint /api/analytics-config responde con measurementId G-RJFGW1349J', async () => {
    const res = await makeRequest(server, {
      path: '/api/analytics-config',
      headers: { host: 'capfit.store' }
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.measurementId, 'G-RJFGW1349J');
  });

  await test('js/analytics.js se sirve con el ID G-RJFGW1349J y capfitTrack', async () => {
    const res = await makeRequest(server, {
      path: '/js/analytics.js',
      headers: { host: 'app.capfit.store' }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('G-RJFGW1349J'), 'Debe contener el ID G-RJFGW1349J');
    assert.ok(res.body.includes('capfitTrack'), 'Debe contener la función capfitTrack');
  });

  await new Promise((resolve) => server.close(resolve));

  console.log(`\n📊 Resultado final: ${passed} pruebas exitosas, ${failed} fallidas.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runDomainTests().catch(err => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
