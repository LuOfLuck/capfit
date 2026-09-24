// api/gpt.js
// Proxy para OpenAI GPT-Image edit endpoint via fal.ai con fallback automático

const https = require('https');

const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6MB

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (!isNaN(contentLength) && contentLength > maxBytes) {
      const err = new Error('El tamaño de la solicitud excede el límite permitido (6MB).');
      err.statusCode = 413;
      return reject(err);
    }

    const chunks = [];
    let receivedBytes = 0;
    req.on('data', c => {
      receivedBytes += c.length;
      if (receivedBytes > maxBytes) {
        const err = new Error('El tamaño de la solicitud excede el límite permitido (6MB).');
        err.statusCode = 413;
        req.destroy();
        return reject(err);
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function httpsRequest(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const r = https.request({ hostname, path, method, headers }, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
        json() { return JSON.parse(this.body.toString()); }
      }));
    });
    r.on('error', reject);
    if (body && body.length > 0) r.write(body);
    r.end();
  });
}

async function uploadDataURItoFal(dataURI, falKey) {
  const match = dataURI.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Formato imagen inválido');
  const mimeType = match[1];
  const buffer   = Buffer.from(match[2], 'base64');
  const initBody = Buffer.from(JSON.stringify({ content_type: mimeType, file_size: buffer.length }));
  const init = await httpsRequest('rest.alpha.fal.ai', '/storage/upload/initiate', 'POST', {
    'Authorization': 'Key ' + falKey,
    'Content-Type':  'application/json',
    'Content-Length': initBody.length,
  }, initBody);
  if (init.status !== 200) {
    const up = await httpsRequest('storage.fal.ai', '/upload', 'POST', {
      'Authorization': 'Key ' + falKey, 'Content-Type': mimeType, 'Content-Length': buffer.length,
    }, buffer);
    const d = up.json();
    if (!d.url) throw new Error('Upload falló: ' + up.body.toString());
    return d.url;
  }
  const { upload_url, file_url } = init.json();
  const u = new URL(upload_url);
  await httpsRequest(u.hostname, u.pathname + u.search, 'PUT', {
    'Content-Type': mimeType, 'Content-Length': buffer.length,
  }, buffer);
  return file_url;
}

module.exports = async function handler(req, res) {
  const startTime = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Capfit-Client,X-Requested-With');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const clientHeader = req.headers['x-capfit-client'];
  const requestedWith = req.headers['x-requested-with'];
  if (clientHeader !== 'capfit-web-v1' && requestedWith !== 'XMLHttpRequest') {
    res.status(403).json({ error: 'Acceso no autorizado. Las solicitudes deben originarse desde la aplicación.' });
    return;
  }

  const falKey = process.env.FAL_KEY || '';
  if (!falKey) {
    res.status(500).json({ error: 'FAL_KEY no configurada en variables de entorno.' });
    return;
  }

  try {
    let body;
    try {
      body = await readBody(req);
    } catch (bodyErr) {
      const status = bodyErr.statusCode === 413 ? 413 : 400;
      res.status(status).json({ error: bodyErr.message || 'Error en el cuerpo de la solicitud' });
      return;
    }
    
    let payload;
    try {
      payload = JSON.parse(body.toString());
    } catch (e) {
      res.status(400).json({ error: 'JSON inválido en body: ' + e.message });
      return;
    }

    if (!payload.image_urls || !Array.isArray(payload.image_urls) || payload.image_urls.length === 0) {
      res.status(400).json({ error: 'image_urls es requerido y debe ser un array no vacío' });
      return;
    }

    // Convertir data URIs a URLs públicas de fal storage
    let publicImageUrls;
    try {
      publicImageUrls = await Promise.all(
        payload.image_urls.map(async (img) => {
          if (typeof img === 'string' && img.startsWith('data:')) {
            return await uploadDataURItoFal(img, falKey);
          }
          return img;
        })
      );
    } catch (uploadErr) {
      res.status(400).json({ error: 'Error al procesar imágenes: ' + uploadErr.message });
      return;
    }

    const primaryRoute = (payload.model_route || 'openai/gpt-image-2.5/sunburst/edit').replace(/^\//, '');
    const fallbackRoute = (payload.fallback_route || 'openai/gpt-image-2/edit').replace(/^\//, '');

    const primaryPayload = {
      prompt: payload.prompt,
      image_urls: publicImageUrls,
      quality: payload.quality || 'medium',
      image_size: payload.image_size || 'auto',
      output_compression: payload.output_compression !== undefined ? payload.output_compression : 80,
      output_format: payload.output_format || 'jpeg',
    };
    const primaryBuffer = Buffer.from(JSON.stringify(primaryPayload));

    let result = await httpsRequest(
      'fal.run',
      '/' + primaryRoute,
      'POST',
      {
        'Content-Type': 'application/json',
        'Authorization': 'Key ' + falKey,
        'Content-Length': primaryBuffer.length,
      },
      primaryBuffer
    );

    const bodyStr = result.body ? result.body.toString() : '';
    const is404 = result.status === 404;
    const isModelNotFound = result.status === 400 && /model[_\s-]?not[_\s-]?found|invalid[_\s-]?model|unknown[_\s-]?model/i.test(bodyStr);
    const isAvailabilityError = (result.status === 503 || result.status === 422 || result.status === 502) &&
      /model|unavailable|not found|does not exist/i.test(bodyStr);

    if (is404 || isModelNotFound || isAvailabilityError) {
      const fallbackPayload = {
        prompt: payload.prompt,
        image_urls: publicImageUrls,
        quality: 'low',
        image_size: 'square',
        output_format: payload.output_format || 'jpeg',
      };
      const fallbackBuffer = Buffer.from(JSON.stringify(fallbackPayload));

      result = await httpsRequest(
        'fal.run',
        '/' + fallbackRoute,
        'POST',
        {
          'Content-Type': 'application/json',
          'Authorization': 'Key ' + falKey,
          'Content-Length': fallbackBuffer.length,
        },
        fallbackBuffer
      );
    }

    console.log(`[REQ] endpoint=/api/gpt/edit status=${result.status} duration=${Date.now() - startTime}ms`);

    res.status(result.status)
       .setHeader('Content-Type', result.headers['content-type'] || 'application/json')
       .end(result.body);

  } catch (e) {
    console.error(`[REQ] endpoint=/api/gpt/edit status=502 duration=${Date.now() - startTime}ms note="${e.message}"`);
    res.status(502).json({ error: e.message });
  }
};