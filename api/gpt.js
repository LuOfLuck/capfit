// api/gpt.js
// Proxy para OpenAI GPT-Image edit endpoint via fal.ai con fallback automático

const https = require('https');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
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
      }));
    });
    r.on('error', reject);
    if (body && body.length > 0) r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const falKey = process.env.FAL_KEY || '';
  if (!falKey) {
    res.status(500).json({ error: 'FAL_KEY no configurada en variables de entorno.' });
    return;
  }

  try {
    const body = await readBody(req);
    
    // Parsear para validar y loggear
    let payload;
    try {
      payload = JSON.parse(body.toString());
    } catch (e) {
      res.status(400).json({ error: 'JSON inválido en body: ' + e.message });
      return;
    }

    // Validar campos requeridos
    if (!payload.image_urls || !Array.isArray(payload.image_urls) || payload.image_urls.length === 0) {
      res.status(400).json({ error: 'image_urls es requerido y debe ser un array no vacío' });
      return;
    }

    const primaryRoute = (payload.model_route || 'openai/gpt-image-2.5/sunburst/edit').replace(/^\//, '');
    const fallbackRoute = (payload.fallback_route || 'openai/gpt-image-2/edit').replace(/^\//, '');

    console.log(`[gpt-image] Payload recibido para ${primaryRoute}:`, JSON.stringify({
      prompt: payload.prompt?.slice(0, 50),
      image_urls_count: payload.image_urls?.length,
      quality: payload.quality || 'medium',
      image_size: payload.image_size || 'auto',
      output_compression: payload.output_compression !== undefined ? payload.output_compression : 80,
      output_format: payload.output_format || 'jpeg',
    }));

    const primaryPayload = {
      prompt: payload.prompt,
      image_urls: payload.image_urls,
      quality: payload.quality || 'medium',
      image_size: payload.image_size || 'auto',
      output_compression: payload.output_compression !== undefined ? payload.output_compression : 80,
      output_format: payload.output_format || 'jpeg',
    };
    const primaryBuffer = Buffer.from(JSON.stringify(primaryPayload));

    // Reenviar a fal.ai
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

    console.log(`[gpt-image] fal.ai ${primaryRoute} status:`, result.status);

    const bodyStr = result.body ? result.body.toString() : '';
    const is404 = result.status === 404;
    const isModelNotFound = result.status === 400 && /model[_\s-]?not[_\s-]?found|invalid[_\s-]?model|unknown[_\s-]?model/i.test(bodyStr);
    const isAvailabilityError = (result.status === 503 || result.status === 422 || result.status === 502) &&
      /model|unavailable|not found|does not exist/i.test(bodyStr);

    if (is404 || isModelNotFound || isAvailabilityError) {
      console.log('[TRYON] Fallback a gpt-image-2 aplicado');
      const fallbackPayload = {
        prompt: payload.prompt,
        image_urls: payload.image_urls,
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
      console.log(`[TRYON] fal.ai fallback ${fallbackRoute} status:`, result.status);
    }

    res.status(result.status)
       .setHeader('Content-Type', result.headers['content-type'] || 'application/json')
       .end(result.body);

  } catch (e) {
    console.error('[gpt-image] error:', e.message);
    res.status(502).json({ error: e.message });
  }
};