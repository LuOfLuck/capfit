// api/fal/[...route].js
// Proxy para fal.ai — la API key viene de variable de entorno, nunca del browser
// Vercel: configurar FAL_KEY en Settings → Environment Variables

const https = require('https');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function proxyRequest(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const proxyReq = https.request({ hostname, path, method, headers }, proxyRes => {
      proxyRes.on('data', c => chunks.push(c));
      proxyRes.on('end', () => resolve({
        status:  proxyRes.statusCode,
        headers: proxyRes.headers,
        body:    Buffer.concat(chunks),
      }));
    });
    proxyReq.on('error', reject);
    if (body && body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ── API key desde variable de entorno (nunca del browser) ──
  const falKey = process.env.FAL_KEY || '';
  if (!falKey) {
    res.status(500).json({ error: 'FAL_KEY no configurada en las variables de entorno de Vercel.' });
    return;
  }

  const authHdr = { 'Authorization': 'Key ' + falKey };

  try {
    const routeParts = req.query.route || [];
    const route = Array.isArray(routeParts) ? routeParts.join('/') : routeParts;
    const { model, reqId } = req.query;

    // ── POST /api/fal/submit ──
    if (route === 'submit' && req.method === 'POST') {
      if (!model) { res.status(400).json({ error: 'Falta ?model=' }); return; }
      const body = await readBody(req);
      const result = await proxyRequest(
        'queue.fal.run',
        '/' + model,
        'POST',
        { 'Content-Type': 'application/json', 'Content-Length': body.length, ...authHdr },
        body
      );
      res.status(result.status)
         .setHeader('Content-Type', result.headers['content-type'] || 'application/json')
         .end(result.body);
      return;
    }

    // ── GET /api/fal/status ──
    if (route === 'status' && req.method === 'GET') {
      if (!model || !reqId) { res.status(400).json({ error: 'Faltan ?model= y/o ?reqId=' }); return; }
      const result = await proxyRequest(
        'queue.fal.run',
        '/' + model + '/requests/' + reqId + '/status',
        'GET',
        { ...authHdr },
        null
      );
      res.status(result.status)
         .setHeader('Content-Type', result.headers['content-type'] || 'application/json')
         .end(result.body);
      return;
    }

    // ── GET /api/fal/result ──
    if (route === 'result' && req.method === 'GET') {
      if (!model || !reqId) { res.status(400).json({ error: 'Faltan ?model= y/o ?reqId=' }); return; }
      const result = await proxyRequest(
        'queue.fal.run',
        '/' + model + '/requests/' + reqId,
        'GET',
        { ...authHdr },
        null
      );
      res.status(result.status)
         .setHeader('Content-Type', result.headers['content-type'] || 'application/json')
         .end(result.body);
      return;
    }

    res.status(404).json({ error: 'Ruta no encontrada: ' + route });

  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};