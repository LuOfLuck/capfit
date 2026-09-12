/**
 * api/handlers/anthropic.js
 * Proxy seguro para peticiones a Claude / Anthropic Messages API
 */

const { readBody, proxyRequest, sendJson } = require('../lib/http-helpers');
const { applyRateLimit } = require('../lib/guard');

module.exports = async function handleAnthropic(req, res) {
  const start = Date.now();

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Método no permitido' }, req);
  }

  if (!applyRateLimit(req, res)) return;

  const apiKey = process.env.ANTHROPIC_KEY || '';
  if (!apiKey) {
    return sendJson(res, 500, { error: 'ANTHROPIC_KEY no configurada en .env' }, req);
  }

  try {
    const body = await readBody(req);
    console.log(JSON.stringify({
      endpoint: '/api/anthropic',
      action: 'proxy_start',
      durationMs: Date.now() - start
    }));

    proxyRequest('api.anthropic.com', '/v1/messages', 'POST', {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
      'Content-Length': Buffer.byteLength(body),
    }, body, res, req);
  } catch (e) {
    console.error(JSON.stringify({
      endpoint: '/api/anthropic',
      error: e.message,
      durationMs: Date.now() - start
    }));
    sendJson(res, 500, { error: e.message }, req);
  }
};
