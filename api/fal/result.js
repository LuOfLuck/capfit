const https = require('https');

function proxyRequest(targetHost, targetPath, method, headers, body, res) {
  const proxyReq = https.request({ hostname: targetHost, path: targetPath, method, headers }, proxyRes => {
    res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'application/json' });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', err => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  });
  proxyReq.end();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const falKey = process.env.FAL_KEY || '';
  const model = req.query?.model || 'fal-ai/fashn/tryon/v1.5';
  const reqId = req.query?.reqId || '';

  if (!falKey) {
    res.status(500).json({ error: 'FAL_KEY no configurada' });
    return;
  }

  try {
    proxyRequest('queue.fal.run', '/' + model + '/requests/' + reqId, 'GET', {
      'Authorization': 'Key ' + falKey,
    }, null, res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};