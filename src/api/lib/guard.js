/**
 * src/api/lib/guard.js
 * Capa de seguridad: Validación de origen, Rate Limiting y Protección anti-abuso de cuota por tienda.
 */

const { sendJson } = require('./http-helpers.js');
let StoreManager = null;

try {
  StoreManager = require('../../store-manager.js');
} catch (e) {
  try {
    StoreManager = require('../../store-manager');
  } catch (err) {
    console.warn('StoreManager no encontrado en src/api/lib/guard:', err.message);
  }
}

// ── Rate Limiter en Memoria ──────────────────────────────────────────────────
const ipRequestHistory = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 10;     // 10 requests / minuto para endpoints de IA

function checkRateLimit(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? forwarded.split(',')[0].trim() : null) ||
             (req.socket ? req.socket.remoteAddress : null) ||
             'unknown_ip';

  const now = Date.now();
  let record = ipRequestHistory.get(ip);

  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipRequestHistory.set(ip, record);
    return { ok: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    return {
      ok: false,
      remaining: 0,
      retryAfterSec,
      error: `Límite de solicitudes de IA excedido (máx ${RATE_LIMIT_MAX_REQUESTS} por minuto). Por favor esperá ${retryAfterSec} segundos.`
    };
  }

  record.count += 1;
  return { ok: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

/**
 * Middleware para aplicar Rate Limiting en endpoints de IA
 */
function applyRateLimit(req, res) {
  const result = checkRateLimit(req);
  if (!result.ok) {
    sendJson(res, 429, {
      ok: false,
      error: result.error,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: result.retryAfterSec
    }, req, { 'Retry-After': String(result.retryAfterSec) });
    return false;
  }
  return true;
}

/**
 * Resolución segura de la tienda (Tenant Isolation)
 */
async function resolveAndValidateStore(req) {
  if (StoreManager && typeof StoreManager.ensureInitialized === 'function') {
    await StoreManager.ensureInitialized();
  }

  const host = (req.headers.host || '').toLowerCase();
  const hostWithoutPort = host.split(':')[0];

  let hostResolvedStore = null;
  if (StoreManager && typeof StoreManager.resolveStoreFromRequest === 'function') {
    hostResolvedStore = StoreManager.resolveStoreFromRequest(req);
  } else {
    hostResolvedStore = { id: 'principal', subdomain: 'capfit', name: 'CAPFIT Oficial' };
  }

  let queryStoreId = null;
  try {
    const urlObj = new URL(req.url, `http://${host || 'localhost'}`);
    queryStoreId = (urlObj.searchParams.get('store') || urlObj.searchParams.get('tienda') || '').trim().toLowerCase();
  } catch (_) {}

  const isProductionSubdomain = hostWithoutPort.endsWith('.capfit.store') &&
                                hostWithoutPort !== 'capfit.store' &&
                                hostWithoutPort !== 'www.capfit.store';

  if (isProductionSubdomain) {
    return hostResolvedStore;
  }

  if (queryStoreId && StoreManager && typeof StoreManager.getStoreById === 'function') {
    const matchedStore = StoreManager.getStoreById(queryStoreId) || StoreManager.getStoreBySubdomain(queryStoreId);
    if (matchedStore) {
      return matchedStore;
    }
  }

  return hostResolvedStore;
}

module.exports = {
  checkRateLimit,
  applyRateLimit,
  resolveAndValidateStore
};
