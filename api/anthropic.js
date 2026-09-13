// api/anthropic.js
// Proxy para Anthropic API — la key viene de variable de entorno
// Vercel: configurar ANTHROPIC_KEY en Settings → Environment Variables

const https = require('https');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  // ── API key desde variable de entorno ──
  const apiKey = process.env.ANTHROPIC_KEY || '';
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_KEY no configurada en las variables de entorno de Vercel.' });
    return;
  }

  try {
    const body = await readBody(req);

    await new Promise((resolve, reject) => {
      const proxyReq = https.request({
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
          'Content-Type':      'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key':         apiKey,
          'Content-Length':    Buffer.byteLength(body),
        },
      }, proxyRes => {
        res.status(proxyRes.statusCode);
        res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'application/json');
        proxyRes.pipe(res);
        proxyRes.on('end', resolve);
      });
      proxyReq.on('error', reject);
      proxyReq.write(body);
      proxyReq.end();
    });

  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};