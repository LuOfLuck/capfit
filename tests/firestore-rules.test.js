/**
 * Tests unitarios de seguridad para firestore.rules
 * Verifica la mitigación de los 12 payloads del security_spec.md
 *
 * Ejecución:
 *   npm run test:rules
 * (Requiere Firebase Local Emulator Suite o entorno de test)
 */

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'capfit-rules-test';
let testEnv;

describe('CAPFIT Firestore Security Rules - Dirty Dozen Payloads & Invariants', function() {
  this.timeout(10000);

  before(async () => {
    const rules = fs.readFileSync(path.resolve(__dirname, 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules }
    });
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();

    // Setup base data with admin context
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Registrar tienda principal y tienda1
      await db.collection('stores').doc('tienda1').set({
        id: 'tienda1',
        subdomain: 'tienda1',
        name: 'Tienda Uno',
        plan: 'Starter',
        aiMonthlyLimit: 100,
        aiGenerationsUsed: 10,
        isActive: true
      });

      // Mapear dueño de tienda1
      await db.collection('store_owners').doc('owner_user_1').set({
        uid: 'owner_user_1',
        storeId: 'tienda1',
        email: 'owner@tienda1.com'
      });

      // Producto base
      await db.collection('products').doc('prod_1').set({
        id: 'prod_1',
        storeId: 'tienda1',
        nombre: 'Gorra Clásica',
        precio: 25000,
        stock: 10,
        createdAt: '2026-01-01T00:00:00.000Z'
      });

      // Orden base entregada
      await db.collection('orders').doc('order_entregada').set({
        id: 'order_entregada',
        storeId: 'tienda1',
        total: 25000,
        items: [{ id: 'prod_1', cantidad: 1 }],
        status: 'entregado',
        createdAt: '2026-01-01T00:00:00.000Z'
      });
    });
  });

  it('Payload 1: Debe rechazar la inyección de campos no autorizados / ghost fields o usuarios no dueños', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(anonDb.collection('products').doc('prod_hack').set({
      id: 'prod_hack',
      storeId: 'tienda1',
      nombre: 'Hacked',
      precio: 100,
      isSuperAdmin: true
    }));
  });

  it('Payload 2: Debe rechazar envenenamiento cross-tenant (dueño de tienda 2 creando en tienda 1)', async () => {
    const attackerDb = testEnv.authenticatedContext('user_attacker_store2').firestore();
    await assertFails(attackerDb.collection('products').doc('prod_cross').set({
      id: 'prod_cross',
      storeId: 'tienda1',
      nombre: 'Gorra Intrusión',
      precio: 15000,
      stock: 5
    }));
  });

  it('Payload 3: Debe rechazar IDs sobredimensionados (>128 chars) para mitigar Denial of Wallet', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    const oversizedId = 'A'.repeat(150);
    await assertFails(ownerDb.collection('products').doc(oversizedId).set({
      id: oversizedId,
      storeId: 'tienda1',
      nombre: 'Gorra DoW',
      precio: 12000
    }));
  });

  it('Payload 4: Debe rechazar stock negativo', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    await assertFails(ownerDb.collection('products').doc('prod_neg_stock').set({
      id: 'prod_neg_stock',
      storeId: 'tienda1',
      nombre: 'Gorra Stock Negativo',
      precio: 15000,
      stock: -50
    }));
  });

  it('Payload 5: Debe rechazar precio negativo', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    await assertFails(ownerDb.collection('products').doc('prod_neg_price').set({
      id: 'prod_neg_price',
      storeId: 'tienda1',
      nombre: 'Gorra Gratis Hacker',
      precio: -100,
      stock: 5
    }));
  });

  it('Payload 6: Debe rechazar la alteración directa de cuotas o billing (aiGenerationsUsed, plan)', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    await assertFails(ownerDb.collection('stores').doc('tienda1').update({
      aiGenerationsUsed: 0
    }));
  });

  it('Payload 7: Debe rechazar scraping de órdenes por parte de usuarios que no son dueños ni admins', async () => {
    const normalUserDb = testEnv.authenticatedContext('regular_user').firestore();
    await assertFails(normalUserDb.collection('orders').get());
  });

  it('Payload 8: Debe rechazar la mutación de campos inmutables (id, storeId, createdAt) en update', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    await assertFails(ownerDb.collection('products').doc('prod_1').update({
      storeId: 'tienda_otra'
    }));
  });

  it('Payload 9: Debe rechazar la reversión de estados terminales (entregado a pendiente)', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    await assertFails(ownerDb.collection('orders').doc('order_entregada').update({
      status: 'pendiente'
    }));
  });

  it('Payload 10: Debe rechazar envenenamiento de tipos (precio string en vez de número)', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    await assertFails(ownerDb.collection('products').doc('prod_type_poison').set({
      id: 'prod_type_poison',
      storeId: 'tienda1',
      nombre: 'Gorra Poison',
      precio: 'gratis'
    }));
  });

  it('Payload 11: Debe rechazar storeId vacío o ausente', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    await assertFails(ownerDb.collection('products').doc('prod_no_store').set({
      id: 'prod_no_store',
      storeId: '',
      nombre: 'Sin tienda',
      precio: 1000
    }));
  });

  it('Payload 12: Debe validar payloads de orden y requerir items como array', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(anonDb.collection('orders').doc('order_bad_items').set({
      id: 'order_bad_items',
      storeId: 'tienda1',
      total: 10000,
      items: 'unstructured_string_not_list',
      status: 'pendiente'
    }));
  });

  it('Operación válida: Un cliente anónimo puede crear una orden con schema legítimo', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(anonDb.collection('orders').doc('order_valida_123').set({
      id: 'order_valida_123',
      storeId: 'tienda1',
      total: 25000,
      items: [{ id: 'prod_1', cantidad: 1 }],
      status: 'pendiente'
    }));
  });

  it('Operación válida: El dueño de tienda puede actualizar precio y stock de su producto', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_user_1').firestore();
    await assertSucceeds(ownerDb.collection('products').doc('prod_1').update({
      nombre: 'Gorra Clásica Renombrada',
      precio: 29999,
      stock: 15
    }));
  });
});
