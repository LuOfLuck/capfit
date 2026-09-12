/**
 * api/serverless.js
 * Router principal de Vercel Serverless Functions para CAPFIT.
 * Unifica todos los endpoints de IA y tiendas reutilizando los módulos api/lib/*.
 */

const url = require('url');
const { corsHeaders, sendJson } = require('./lib/http-helpers');
const handleGptEdit = require('./handlers/gpt-edit');
const handleFalSubmit = require('./handlers/fal-submit');
const handleFalStatus = require('./handlers/fal-status');
const handleFalResult = require('./handlers/fal-result');
const handleAnthropic = require('./handlers/anthropic');

let StoreManager = null;
try {
  StoreManager = require('../src/store-manager');
} catch (e) {
  console.warn('StoreManager no cargado en serverless.js:', e.message);
}

module.exports = async function handler(req, res) {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    const headers = corsHeaders(req);
    res.writeHead(204, headers);
    res.end();
    return;
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '';
  const qs = parsed.query || {};

  // ── Endpoints de IA ──────────────────────────────────────────────
  if (pathname === '/api/gpt/edit') {
    return handleGptEdit(req, res);
  }

  if (pathname === '/api/fal/submit') {
    return handleFalSubmit(req, res, qs);
  }

  if (pathname === '/api/fal/status') {
    return handleFalStatus(req, res, qs);
  }

  if (pathname === '/api/fal/result') {
    return handleFalResult(req, res, qs);
  }

  if (pathname === '/api/anthropic') {
    return handleAnthropic(req, res);
  }

  // ── Endpoints de Tiendas y Cuota ──────────────────────────────────
  if (pathname === '/api/store/current') {
    if (StoreManager && typeof StoreManager.ensureInitialized === 'function') {
      await StoreManager.ensureInitialized();
    }
    const store = StoreManager ? StoreManager.resolveStoreFromRequest(req) : { id: 'principal', subdomain: 'capfit', name: 'CAPFIT' };
    const quota = StoreManager ? StoreManager.getAiQuotaStatus(store.id) : null;
    return sendJson(res, 200, {
      ok: true,
      store: {
        id: store.id,
        subdomain: store.subdomain,
        fullDomain: store.fullDomain || `${store.subdomain}.capfit.store`,
        name: store.name,
        tagline: store.tagline || '',
        plan: store.plan || 'Starter',
        brandColor: store.brandColor || '#111111'
      },
      aiQuota: quota
    }, req);
  }

  if (pathname === '/api/stores') {
    if (StoreManager && typeof StoreManager.ensureInitialized === 'function') {
      await StoreManager.ensureInitialized();
    }
    const all = StoreManager ? StoreManager.getAllStores() : [];
    const publicList = all.map(s => ({
      id: s.id,
      subdomain: s.subdomain,
      fullDomain: s.fullDomain || `${s.subdomain}.capfit.store`,
      name: s.name,
      tagline: s.tagline,
      plan: s.plan,
      aiQuota: StoreManager ? StoreManager.getAiQuotaStatus(s.id) : null,
      active: s.active
    }));
    return sendJson(res, 200, publicList, req);
  }

  // Ruta no encontrada
  return sendJson(res, 404, { error: `Ruta de API no encontrada: ${pathname}` }, req);
};
