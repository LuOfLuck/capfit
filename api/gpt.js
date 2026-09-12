/**
 * api/gpt.js
 * Thin wrapper para routing nativo de Vercel Serverless.
 * Delega directamente al manejador unificado en api/handlers/gpt-edit.js.
 */
module.exports = require('./handlers/gpt-edit');
