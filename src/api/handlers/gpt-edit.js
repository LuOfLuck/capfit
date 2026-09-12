/**
 * src/api/handlers/gpt-edit.js
 * Manejador para POST /api/gpt/edit (edición con GPT-Image-2 vía fal.ai)
 * Incluye rate limiting, verificación de cuota por tienda y auto-reintegro si falla.
 */

const { readBody, sendJson } = require('../lib/http-helpers.js');
const { applyRateLimit, resolveAndValidateStore } = require('../lib/guard.js');
const { checkAndDeductAiCredit, refundAiCredit } = require('../lib/quota.js');
const { editGPTImage } = require('../lib/fal-client.js');
let CONFIG = null;
try {
  CONFIG = require('../../../js/config.js');
} catch (e) {
  try {
    CONFIG = require('../../../js/config');
  } catch (_) {
    CONFIG = { aiModelRoute: 'fal-ai/gpt-image-2/edit' };
  }
}

module.exports = async function handleGptEdit(req, res) {
  const start = Date.now();
  let store = null;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Método no permitido' }, req);
  }

  // 1. Rate Limiting
  if (!applyRateLimit(req, res)) return;

  const key = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!key) {
    return sendJson(res, 500, {
      error: 'FAL_KEY no configurada en las variables de entorno del servidor',
      code: 'MISSING_API_KEY'
    }, req);
  }

  // 2. Tenant Isolation
  try {
    store = await resolveAndValidateStore(req);
  } catch (e) {
    console.warn('[gpt-edit] No se pudo resolver tienda:', e.message);
  }

  const storeId = store ? store.id : 'principal';

  // 3. Verificación de Cuota y Descuento Atómico
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

  // 4. Lectura de Body
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

  const prompt = (payload.prompt || '').trim();
  const imageUrls = Array.isArray(payload.image_urls) ? payload.image_urls : [];

  if (!prompt || imageUrls.length === 0) {
    await refundAiCredit(storeId, 'Faltan parámetros prompt o image_urls');
    return sendJson(res, 400, {
      error: 'Se requiere "prompt" e "image_urls" con al menos 1 imagen',
      code: 'INVALID_PAYLOAD'
    }, req);
  }

  // Auto resolución de tamaño
  let imageSize = payload.image_size;
  if (!imageSize || imageSize === 'auto') {
    imageSize = 'auto';
  }

  const falPayload = {
    prompt,
    image_urls: imageUrls,
    image_size: imageSize,
    quality: payload.quality || 'standard',
    output_format: payload.output_format || 'jpeg'
  };

  // 5. Ejecución en fal.ai
  try {
    const upstream = await editGPTImage(falPayload, key);
    const data = upstream.json() || { raw: upstream.body.toString() };

    // Si hubo falla 5xx en el proveedor, devolver el crédito automáticamente
    if (upstream.status >= 500) {
      console.warn(`[gpt-edit] Upstream error 5xx (${upstream.status}), reintegrando crédito a tienda ${storeId}`);
      await refundAiCredit(storeId, `Error 5xx en fal.ai (${upstream.status})`);
    }

    sendJson(res, upstream.status, data, req, {
      'X-Response-Time-Ms': String(Date.now() - start),
      'X-AI-Quota-Remaining': String(quotaResult.remaining || 0)
    });
  } catch (err) {
    console.error('[gpt-edit] Error al ejecutar edición:', err);
    await refundAiCredit(storeId, 'Excepción de red o procesamiento: ' + err.message);
    sendJson(res, 502, {
      error: 'Error al procesar edición en fal.ai: ' + err.message,
      code: 'UPSTREAM_ERROR'
    }, req);
  }
};
