/**
 * api/handlers/fal-submit.js
 * Manejador para POST /api/fal/submit (Encolado de Try-On en fal.ai / FASHN)
 * Aplica rate limiting, cuotas mensuales por tienda y reintegros en caso de fallo 5xx.
 */

const { readBody, sendJson } = require('../lib/http-helpers');
const { applyRateLimit, resolveAndValidateStore } = require('../lib/guard');
const { checkAndDeductAiCredit, refundAiCredit } = require('../lib/quota');
const { submitTryOn } = require('../lib/fal-client');

module.exports = async function handleFalSubmit(req, res, qs = {}) {
  const start = Date.now();

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Método no permitido' }, req);
  }

  // 1. Rate Limiting
  if (!applyRateLimit(req, res)) return;

  const falKey = process.env.FAL_KEY || '';
  if (!falKey) {
    return sendJson(res, 500, { error: 'FAL_KEY no configurada en las variables de entorno' }, req);
  }

  // 2. Resolver y aislar tienda
  const store = await resolveAndValidateStore(req);
  const model = qs.model || 'fal-ai/fashn/tryon/v1.5';

  let payload;
  try {
    const raw = await readBody(req);
    payload = JSON.parse(raw.toString() || '{}');
  } catch (err) {
    const statusCode = err.statusCode || 400;
    return sendJson(res, statusCode, { error: err.message || 'JSON inválido en el cuerpo' }, req);
  }

  if (!payload.model_image || !payload.garment_image) {
    return sendJson(res, 400, { error: 'model_image y garment_image son campos requeridos' }, req);
  }

  // 3. Control de cuota mensual
  const quota = await checkAndDeductAiCredit(store.id);
  if (!quota.ok) {
    return sendJson(res, 429, {
      error: quota.message || 'Límite mensual de pruebas con IA alcanzado para esta tienda.',
      code: 'MONTHLY_AI_LIMIT_REACHED',
      storeName: store.name,
      subdomain: store.subdomain,
      limit: quota.limit,
      used: quota.used,
      remaining: 0
    }, req);
  }

  // 4. Encolar en fal.ai
  try {
    const result = await submitTryOn(model, payload, falKey);
    const durationMs = Date.now() - start;

    console.log(JSON.stringify({
      endpoint: '/api/fal/submit',
      model,
      status: result.status,
      durationMs,
      storeId: store.id
    }));

    if (result.status >= 500) {
      await refundAiCredit(store.id, `FAL HTTP ${result.status}`);
    }

    const contentType = result.headers['content-type'] || 'application/json';
    if (res.writeHead) {
      res.writeHead(result.status, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': req.headers.origin || '*'
      });
      res.end(result.body);
    } else {
      res.status(result.status);
      res.setHeader('Content-Type', contentType);
      res.end(result.body);
    }
  } catch (err) {
    await refundAiCredit(store.id, err.message);
    const durationMs = Date.now() - start;
    console.error(JSON.stringify({
      endpoint: '/api/fal/submit',
      error: err.message,
      durationMs,
      storeId: store.id
    }));
    sendJson(res, 502, { error: 'Error al encolar en fal.ai: ' + err.message }, req);
  }
};
