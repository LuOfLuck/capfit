/**
 * api/handlers/fal-status.js
 * Manejador para GET /api/fal/status (Polling de estado en cola de fal.ai)
 */

const { sendJson } = require('../_lib/http-helpers.js');
const { applyRateLimit } = require('../_lib/guard.js');
const { getStatus } = require('../_lib/fal-client.js');

module.exports = async function handleFalStatus(req, res, qs = {}) {
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
    const result = await getStatus(model, reqId, falKey);
    const durationMs = Date.now() - start;

    console.log(JSON.stringify({
      endpoint: '/api/fal/status',
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
      endpoint: '/api/fal/status',
      error: err.message,
      durationMs: Date.now() - start
    }));
    sendJson(res, 502, { error: 'Error consultando estado en fal.ai: ' + err.message }, req);
  }
};
