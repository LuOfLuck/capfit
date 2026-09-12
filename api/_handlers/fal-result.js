/**
 * api/handlers/fal-result.js
 * Manejador para GET /api/fal/result (Obtención de resultado procesado en fal.ai)
 */

const { sendJson } = require('../_lib/http-helpers');
const { applyRateLimit } = require('../_lib/guard');
const { getResult } = require('../_lib/fal-client');

module.exports = async function handleFalResult(req, res, qs = {}) {
  const start = Date.now();

  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método no permitido' }, req);
  }

  if (!applyRateLimit(req, res)) return;

  const falKey = process.env.FAL_KEY || '';
  if (!falKey) {
    return sendJson(res, 500, { error: 'FAL_KEY no configurada' }, req);
  }

  const model = qs.model || 'fal-ai/fashn/tryon/v1.5';
  const reqId = qs.reqId || '';

  if (!reqId) {
    return sendJson(res, 400, { error: 'reqId es requerido en query params' }, req);
  }

  try {
    const result = await getResult(model, reqId, falKey);
    const durationMs = Date.now() - start;

    console.log(JSON.stringify({
      endpoint: '/api/fal/result',
      model,
      status: result.status,
      durationMs
    }));

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
    console.error(JSON.stringify({
      endpoint: '/api/fal/result',
      error: err.message,
      durationMs: Date.now() - start
    }));
    sendJson(res, 502, { error: 'Error obteniendo resultado de fal.ai: ' + err.message }, req);
  }
};
