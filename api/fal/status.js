/**
 * api/fal/status.js
 * Thin wrapper para routing nativo de Vercel Serverless.
 * Delega directamente al manejador unificado en api/handlers/fal-status.js.
 */
const url = require('url');
const handleFalStatus = require('../handlers/fal-status');

module.exports = function(req, res) {
  const qs = url.parse(req.url, true).query || {};
  return handleFalStatus(req, res, qs);
};
