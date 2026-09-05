/**
 * Vercel Serverless Function Handler for CAPFIT
 * Handles all /api/* requests (stores, products, orders, try-on, AI quota, auth, and database)
 */

const appHandler = require('../server');

module.exports = async function handler(req, res) {
  try {
    return await appHandler(req, res);
  } catch (err) {
    console.error('Vercel Serverless Error:', err);
    if (!res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
    }
  }
};
