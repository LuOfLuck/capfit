/**
 * api/handlers/gpt-edit.js
 * Manejador para POST /api/gpt/edit (edición con GPT-Image-2 vía fal.ai)
 * Incluye rate limiting, verificación de cuota por tienda y auto-reintegro si falla.
 */

const { readBody, sendJson } = require('../_lib/http-helpers.js');
const { applyRateLimit, resolveAndValidateStore } = require('../_lib/guard.js');
const { checkAndDeductAiCredit, refundAiCredit } = require('../_lib/quota.js');
const { editGPTImage } = require('../_lib/fal-client.js');
const CONFIG = require('../../js/config.js');

module.exports = async function handleGptEdit(req, res) {
  const start = Date.now();
  let store = null;
  let creditDeducted = false;

  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Método no permitido' }, req);
    }

    // 1. Rate Limiting por IP
    if (!applyRateLimit(req, res)) return;

    const falKey = process.env.FAL_KEY || '';
    if (!falKey) {
      return sendJson(res, 500, { error: 'FAL_KEY no configurada en las variables de entorno' }, req);
    }

    // 2. Resolver y aislar tienda para consumo de cuota
    store = await resolveAndValidateStore(req);

    let payload;
    try {
      const raw = await readBody(req);
      payload = JSON.parse(raw.toString() || '{}');
    } catch (err) {
      const statusCode = err.statusCode || 400;
      return sendJson(res, statusCode, { error: err.message || 'JSON inválido en el cuerpo' }, req);
    }

    // Validaciones locales antes de tocar la cuota
    if (!payload.image_urls || !Array.isArray(payload.image_urls) || payload.image_urls.length === 0) {
      return sendJson(res, 400, { error: 'image_urls es requerido y debe ser una lista de imágenes' }, req);
    }

    if (!payload.quality) {
      payload.quality = CONFIG.aiQuality || 'low';
    }

    if (!payload.image_size) {
      payload.image_size = CONFIG.aiImageSize || 'auto';
    }

    // 3. Control de cuota mensual (1 crédito por intento de try-on)
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
    creditDeducted = true;

    // 4. Ejecución en fal.ai con el modelo activo (CONFIG.aiModelRoute)
    let result = await editGPTImage(payload, falKey, CONFIG.aiModelRoute);

    // Verificar si fal.ai reportó error de disponibilidad o modelo no encontrado
    const resultBodyStr = result && result.body ? result.body.toString() : '';
    const isAvailabilityError = (
      result.status === 404 ||
      (result.status === 400 && (
        resultBodyStr.toLowerCase().includes('model not found') ||
        resultBodyStr.toLowerCase().includes('not found') ||
        resultBodyStr.toLowerCase().includes('model unavailable') ||
        resultBodyStr.toLowerCase().includes('does not exist') ||
        resultBodyStr.toLowerCase().includes('no model')
      )) ||
      result.status === 502 ||
      result.status === 503
    );

    // Fallback automático a CONFIG.aiFallbackRoute sin consumir crédito extra
    if (isAvailabilityError && CONFIG.aiFallbackRoute) {
      console.log('[TRYON] Fallback a gpt-image-2 aplicado');
      const fallbackPayload = {
        ...payload,
        quality: 'low',
        image_size: 'square'
      };
      delete fallbackPayload.output_compression;

      result = await editGPTImage(fallbackPayload, falKey, CONFIG.aiFallbackRoute);
    }

    const durationMs = Date.now() - start;

    console.log(JSON.stringify({
      endpoint: '/api/gpt/edit',
      status: result.status,
      durationMs,
      storeId: store.id
    }));

    if (result.status >= 400 && creditDeducted) {
      // Reintegrar cuota si el proveedor tuvo error (4xx/5xx)
      await refundAiCredit(store.id, `FAL HTTP ${result.status}`).catch(() => {});
      creditDeducted = false;
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
    if (store && store.id && creditDeducted) {
      await refundAiCredit(store.id, err.message).catch(() => {});
    }
    const durationMs = Date.now() - start;
    console.error(JSON.stringify({
      endpoint: '/api/gpt/edit',
      error: err.message,
      durationMs,
      storeId: store ? store.id : 'desconocido'
    }));
    sendJson(res, 502, { error: 'Error procesando edición de imagen: ' + err.message }, req);
  }
};
