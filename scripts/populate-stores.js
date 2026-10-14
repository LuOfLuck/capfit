/**
 * CAPFIT - Script de Poblado Inicial de Tiendas (Opción A: Separación `stores` + `store_secrets`)
 * Uso: node scripts/populate-stores.js
 */

require('dotenv').config();
const { db } = require('../src/firebase-db');
const { doc, writeBatch, serverTimestamp, deleteField } = require('firebase/firestore');
const { getCurrentAiPeriod, PLAN_CONFIG } = require('../src/store-manager');

const INITIAL_STORES = [
  {
    id: 'principal',
    subdomain: 'principal',
    name: 'CAPFIT Flagship Store',
    tagline: 'Probador Virtual IA de Gorras y Anteojos',
    about: 'Tienda demostrativa oficial de CapFit con catálogo urbano y óptico.',
    plan: 'Enterprise',
    aiMonthlyLimit: PLAN_CONFIG.Enterprise.aiMonthlyLimit,
    aiGenerationsUsed: 0,
    active: true,
    // Se guardarán únicamente en `store_secrets/principal`
    secret: {
      adminUsername: 'admin',
      adminPassword: process.env.ADMIN_PASSWORD || 'capfit2026'
    }
  },
  {
    id: 'ila',
    subdomain: 'ila',
    name: 'ILA Studio',
    tagline: 'Eyewear & Urban Accessories',
    about: 'Diseño independiente de anteojos de sol y armazones con prueba virtual en HD.',
    plan: 'Pro',
    aiMonthlyLimit: PLAN_CONFIG.Pro.aiMonthlyLimit,
    aiGenerationsUsed: 14,
    active: true,
    // Se guardarán únicamente en `store_secrets/ila`
    secret: {
      adminUsername: 'ila_admin',
      adminPassword: process.env.ILA_ADMIN_PASSWORD || 'ila2026_seguro'
    }
  }
];

async function populateStores() {
  console.log('Iniciando migración y poblado con separación stores / store_secrets...');
  const batch = writeBatch(db);
  const currentPeriod = getCurrentAiPeriod();

  for (const item of INITIAL_STORES) {
    const storeRef = doc(db, 'stores', item.id);
    const secretRef = doc(db, 'store_secrets', item.id);

    // 1. Documento público en `stores/{id}` y eliminación explícita de campos heredados sensibles
    batch.set(
      storeRef,
      {
        id: item.id,
        subdomain: item.subdomain,
        name: item.name,
        tagline: item.tagline,
        about: item.about,
        plan: item.plan,
        aiMonthlyLimit: item.aiMonthlyLimit,
        aiGenerationsUsed: item.aiGenerationsUsed,
        aiPeriod: currentPeriod,
        active: item.active,
        createdAt: serverTimestamp(),
        adminUsername: deleteField(),
        adminPassword: deleteField()
      },
      { merge: true }
    );

    // 2. Documento privado en `store_secrets/{id}` inaccesible desde el navegador público
    batch.set(
      secretRef,
      {
        storeId: item.id,
        adminUsername: item.secret.adminUsername,
        adminPassword: item.secret.adminPassword,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    console.log(`✓ Preparada tienda pública [stores/${item.id}] y secreto [store_secrets/${item.id}] (${item.plan}: ${item.aiMonthlyLimit} gen/mes)`);
  }

  await batch.commit();
  console.log('Poblado y limpieza de credenciales públicas completados con éxito.');
}

if (require.main === module) {
  populateStores()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error al poblar tiendas:', err);
      process.exit(1);
    });
}

module.exports = { populateStores };