/**
 * api/fal/result.js
 * Thin wrapper para routing nativo de Vercel Serverless.
 * Delega directamente al manejador unificado en api/handlers/fal-result.js.
 */
const url = require('url');
const handleFalResult = require('../handlers/fal-result');

module.exports = function(req, res) {
  const qs = url.parse(req.url, true).query || {};
  return handleFalResult(req, res, qs);
};
