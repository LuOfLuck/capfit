/**
 * src/api/handlers/fal-result.js
 * Manejador para GET /api/fal/result (Obtención de resultado procesado en fal.ai)
 */

const { sendJson } = require('../lib/http-helpers.js');
const { applyRateLimit } = require('../lib/guard.js');
const { getResult } = require('../lib/fal-client.js');

module.exports = async function handleFalResult(req, res, qs = {}) {
  const start = Date.now();

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método no permitido' }, req);
  }

  // Rate Limiting anti-abuso
  if (!applyRateLimit(req, res)) return;

  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) {
    return sendJson(res, 500, {
      error: 'FAL_KEY no configurada en el servidor',
      code: 'MISSING_API_KEY'
    }, req);
  }

  const model = qs.model;
  const reqId = qs.request_id;

  if (!model || !reqId) {
    return sendJson(res, 400, {
      error: 'Parámetros model y request_id requeridos',
      code: 'MISSING_PARAMS'
    }, req);
  }

  try {
    const upstream = await getResult(model, reqId, key);
    const data = upstream.json() || { raw: upstream.body.toString() };

    sendJson(res, upstream.status, data, req, {
      'X-Response-Time-Ms': String(Date.now() - start)
    });
  } catch (err) {
    console.error('[fal-result] Error al consultar resultado:', err);
    sendJson(res, 502, {
      error: 'Error al consultar resultado en fal.ai: ' + err.message,
      code: 'UPSTREAM_ERROR'
    }, req);
  }
};
