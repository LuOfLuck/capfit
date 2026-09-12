/**
 * api/fal/submit.js
 * Thin wrapper para routing nativo de Vercel Serverless.
 * Delega directamente al manejador unificado en api/handlers/fal-submit.js.
 */
const url = require('url');
const handleFalSubmit = require('../handlers/fal-submit');

module.exports = function(req, res) {
  const qs = url.parse(req.url, true).query || {};
  return handleFalSubmit(req, res, qs);
};
