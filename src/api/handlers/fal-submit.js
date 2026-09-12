/**
 * src/api/handlers/fal-submit.js
 * Manejador para POST /api/fal/submit (Encolado de Try-On en fal.ai / FASHN)
 * Aplica rate limiting, cuotas mensuales por tienda y reintegros en caso de fallo 5xx.
 */

const { readBody, sendJson } = require('../lib/http-helpers.js');
const { applyRateLimit, resolveAndValidateStore } = require('../lib/guard.js');
const { checkAndDeductAiCredit, refundAiCredit } = require('../lib/quota.js');
const { submitTryOn } = require('../lib/fal-client.js');

module.exports = async function handleFalSubmit(req, res, qs = {}) {
  const start = Date.now();

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Método no permitido' }, req);
  }

  // 1. Rate Limiting por IP
  if (!applyRateLimit(req, res)) return;

  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) {
    return sendJson(res, 500, {
      error: 'FAL_KEY no configurada en las variables de entorno',
      code: 'MISSING_API_KEY'
    }, req);
  }

  // 2. Resolver y validar Tenant
  let store = null;
  try {
    store = await resolveAndValidateStore(req);
  } catch (e) {
    console.warn('[fal-submit] No se pudo resolver tienda:', e.message);
  }

  const storeId = store ? store.id : 'principal';

  // 3. Verificación y deducción atómica de crédito
  const quotaResult = await checkAndDeductAiCredit(storeId);
  if (!quotaResult.ok) {
    return sendJson(res, 402, {
      error: quotaResult.error || 'Has alcanzado el límite mensual de generaciones de IA para tu tienda.',
      code: 'QUOTA_EXCEEDED',
      period: quotaResult.period,
      limit: quotaResult.limit,
      used: quotaResult.used
    }, req);
  }

  // 4. Leer Body
  let bodyBuffer;
  try {
    bodyBuffer = await readBody(req);
  } catch (e) {
    await refundAiCredit(storeId, 'Body inválido o payload excedido');
    return sendJson(res, e.statusCode || 400, { error: e.message }, req);
  }

  let payload = {};
  try {
    payload = JSON.parse(bodyBuffer.toString());
  } catch (e) {
    await refundAiCredit(storeId, 'JSON malformado');
    return sendJson(res, 400, { error: 'JSON malformado en la solicitud' }, req);
  }

  const model = qs.model || payload.model || 'fal-ai/fashn/tryon/v1.5';

  // 5. Llamada segura a fal.ai
  try {
    const upstream = await submitTryOn(model, payload, key);
    const data = upstream.json() || { raw: upstream.body.toString() };

    // Si fal.ai retorna error 5xx, reintegrar crédito
    if (upstream.status >= 500) {
      console.warn(`[fal-submit] Upstream 5xx (${upstream.status}), reintegrando crédito a tienda ${storeId}`);
      await refundAiCredit(storeId, `Error 5xx de fal.ai (${upstream.status})`);
    }

    sendJson(res, upstream.status, data, req, {
      'X-Response-Time-Ms': String(Date.now() - start),
      'X-AI-Quota-Remaining': String(quotaResult.remaining || 0)
    });
  } catch (err) {
    console.error('[fal-submit] Excepción llamando a fal.ai:', err);
    await refundAiCredit(storeId, 'Excepción en subida o llamada: ' + err.message);
    sendJson(res, 502, {
      error: 'Error al comunicarse con fal.ai: ' + err.message,
      code: 'UPSTREAM_ERROR'
    }, req);
  }
};
