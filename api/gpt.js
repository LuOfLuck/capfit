// api/gpt.js
// Proxy para OpenAI GPT-Image-2 edit endpoint via fal.ai
// Variable de entorno requerida: FAL_KEY
// Ruta: POST /api/gpt/edit

const https = require('https');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function httpsRequest(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const r = https.request({ hostname, path, method, headers }, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks),
      }));
    });
    r.on('error', reject);
    if (body && body.length > 0) r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return; }

  const falKey = process.env.FAL_KEY || '';
  if (!falKey) {
    res.status(500).json({ error: 'FAL_KEY no configurada en variables de entorno.' });
    return;
  }

  try {
    const body = await readBody(req);

    // GPT-Image-2 en fal.ai usa la REST API directa (no queue)
    // POST https://fal.run/openai/gpt-image-2/edit
    const result = await httpsRequest(
      'fal.run',
      '/openai/gpt-image-2/edit',
      'POST',
      {
        'Content-Type':   'application/json',
        'Authorization':  'Key ' + falKey,
        'Content-Length': body.length,
      },
      body
    );

    console.log('[gpt-image-2] status:', result.status, result.body.toString().slice(0, 200));

    res.status(result.status)
       .setHeader('Content-Type', result.headers['content-type'] || 'application/json')
       .end(result.body);

  } catch (e) {
    console.error('[gpt-image-2] error:', e.message);
    res.status(502).json({ error: e.message });
  }
};