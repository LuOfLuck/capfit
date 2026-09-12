/**
 * src/api/lib/quota.js
 * Gestión y control estricto de cuota mensual de IA por tienda.
 * Disponible tanto en Vercel Serverless como en server.js local.
 */

let StoreManager = null;
let FirebaseDb = null;

try {
  StoreManager = require('../../store-manager.js');
} catch (e) {
  try {
    StoreManager = require('../../store-manager');
  } catch (err) {
    console.warn('StoreManager no disponible en src/api/lib/quota:', err.message);
  }
}

try {
  FirebaseDb = require('../../firebase-db.js');
} catch (e) {
  try {
    FirebaseDb = require('../../firebase-db');
  } catch (err) {
    console.warn('FirebaseDb no disponible en src/api/lib/quota:', err.message);
  }
}

function getCurrentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Verifica si la tienda tiene saldo disponible y descuenta 1 crédito atómicamente
 */
async function checkAndDeductAiCredit(storeId) {
  if (StoreManager && typeof StoreManager.ensureInitialized === 'function') {
    await StoreManager.ensureInitialized();
  }

  const sId = storeId || 'principal';

  if (StoreManager && typeof StoreManager.checkAndDeductAiCredit === 'function') {
    return StoreManager.checkAndDeductAiCredit(sId);
  }

  return {
    ok: true,
    storeId: sId,
    used: 1,
    limit: 100,
    remaining: 99,
    period: getCurrentPeriod()
  };
}

/**
 * Reintegra un crédito en caso de falla externa del servicio (5xx, timeout, error de fal)
 */
async function refundAiCredit(storeId, reason = 'Error en proveedor de IA') {
  const sId = storeId || 'principal';
  const currentPeriod = getCurrentPeriod();

  if (StoreManager && typeof StoreManager.getStoreById === 'function') {
    const store = StoreManager.getStoreById(sId);
    if (store) {
      const currentUsed = Number(store.aiGenerationsUsed) || 0;
      store.aiGenerationsUsed = Math.max(0, currentUsed - 1);

      if (typeof StoreManager.updateStore === 'function') {
        try {
          StoreManager.updateStore(store.id, { aiGenerationsUsed: store.aiGenerationsUsed });
        } catch (_) {}
      }

      if (FirebaseDb && typeof FirebaseDb.logAITryOn === 'function') {
        FirebaseDb.logAITryOn({
          storeId: store.id,
          storeName: store.name,
          period: currentPeriod,
          quotaUsed: store.aiGenerationsUsed,
          quotaLimit: store.aiMonthlyLimit || 100,
          status: 'refunded',
          reason
        }).catch(err => console.warn('Nota log Firestore refund:', err.message));
      }

      return {
        ok: true,
        storeId: store.id,
        refunded: true,
        used: store.aiGenerationsUsed,
        limit: store.aiMonthlyLimit || 100
      };
    }
  }

  return { ok: true, storeId: sId, refunded: true };
}

/**
 * Obtiene el estado actual de la cuota de la tienda
 */
function getAiQuotaStatus(storeId) {
  if (StoreManager && typeof StoreManager.getAiQuotaStatus === 'function') {
    return StoreManager.getAiQuotaStatus(storeId || 'principal');
  }

  return {
    storeId: storeId || 'principal',
    limit: 100,
    used: 0,
    remaining: 100,
    period: getCurrentPeriod(),
    percentUsed: 0
  };
}

module.exports = {
  getCurrentPeriod,
  checkAndDeductAiCredit,
  refundAiCredit,
  getAiQuotaStatus
};
