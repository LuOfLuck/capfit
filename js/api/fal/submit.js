const https = require('https');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function httpsReq(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const req = https.request({ hostname, path, method, headers }, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), json(){ return JSON.parse(this.body.toString()); } }));
    });
    req.on('error', reject);
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

async function uploadDataURItoFal(dataURI, falKey) {
  const match = dataURI.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Formato imagen inválido');
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const initBody = Buffer.from(JSON.stringify({ content_type: mimeType, file_size: buffer.length }));
  const init = await httpsReq('rest.alpha.fal.ai', '/storage/upload/initiate', 'POST', {
    'Authorization': 'Key ' + falKey,
    'Content-Type': 'application/json',
    'Content-Length': initBody.length,
  }, initBody);
  if (init.status !== 200) {
    const up = await httpsReq('storage.fal.ai', '/upload', 'POST', {
      'Authorization': 'Key ' + falKey, 'Content-Type': mimeType, 'Content-Length': buffer.length,
    }, buffer);
    const d = up.json();
    if (!d.url) throw new Error('Upload falló: ' + up.body.toString());
    return d.url;
  }
  const { upload_url, file_url } = init.json();
  const u = new URL(upload_url);
  await httpsReq(u.hostname, u.pathname + u.search, 'PUT', {
    'Content-Type': mimeType, 'Content-Length': buffer.length,
  }, buffer);
  return file_url;
}

function proxyRequest(targetHost, targetPath, method, headers, body, res) {
  const proxyReq = https.request({ hostname: targetHost, path: targetPath, method, headers }, proxyRes => {
    res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'application/json' });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', err => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  });
  if (body && body.length > 0) proxyReq.write(body);
  proxyReq.end();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const falKey = process.env.FAL_KEY || '';
  if (!falKey) {
    res.status(500).json({ error: 'FAL_KEY no configurada' });
    return;
  }

  try {
    const rawBody = await readBody(req);
    const payload = JSON.parse(rawBody.toString());

    const [personURL, garmentURL] = await Promise.all([
      uploadDataURItoFal(payload.model_image, falKey),
      uploadDataURItoFal(payload.garment_image, falKey),
    ]);

    payload.model_image = personURL;
    payload.garment_image = garmentURL;

    const newBody = Buffer.from(JSON.stringify(payload));
    const model = req.query?.model || 'fal-ai/fashn/tryon/v1.5';
    
    proxyRequest('queue.fal.run', '/' + model, 'POST', {
      'Content-Type': 'application/json',
      'Content-Length': newBody.length,
      'Authorization': 'Key ' + falKey,
    }, newBody, res);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};