/**
 * src/api/handlers/anthropic.js
 * Proxy seguro para peticiones a Claude / Anthropic Messages API
 */

const { readBody, proxyRequest, sendJson } = require('../lib/http-helpers.js');
const { applyRateLimit } = require('../lib/guard.js');

module.exports = async function handleAnthropic(req, res) {
  const start = Date.now();

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Método no permitido' }, req);
  }

  // Rate Limiting anti-abuso
  if (!applyRateLimit(req, res)) return;

  const key = process.env.ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return sendJson(res, 500, {
      error: 'ANTHROPIC_KEY no configurada en el entorno del servidor',
      code: 'MISSING_API_KEY'
    }, req);
  }

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return sendJson(res, e.statusCode || 400, { error: e.message }, req);
  }

  const forwardHeaders = {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'content-length': body.length,
  };

  proxyRequest('api.anthropic.com', '/v1/messages', 'POST', forwardHeaders, body, res, req);
};
