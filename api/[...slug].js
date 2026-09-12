/**
 * api/[...slug].js
 * Única Función Serverless Catch-All para Vercel.
 *
 * Centraliza el 100% de los endpoints de CAPFIT bajo una única función dinámica
 * cumpliendo estrictamente con el límite del plan Hobby de Vercel (1 función / 12 máx).
 */

const handleApi = require('../src/api/router.js');

module.exports = async function handler(req, res) {
  return handleApi(req, res);
};
