/**
 * api/lib/fal-client.js
 * Cliente unificado y puro para interacción con fal.ai (FASHN Try-On y GPT Image 2 Edit).
 * No depende de req/res de Vercel ni http nativo.
 */

const { httpsReq } = require('./http-helpers.js');
const CONFIG = require('../../js/config.js');

/**
 * Sube un Data URI base64 al almacenamiento efímero de fal.ai y retorna una URL pública HTTPS
 */
async function uploadDataURItoFal(dataURI, falKey) {
  if (!dataURI || typeof dataURI !== 'string') return dataURI;
  if (dataURI.startsWith('http://') || dataURI.startsWith('https://')) {
    return dataURI; // Ya es una URL pública
  }

  const match = dataURI.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Formato de imagen inválido (se esperaba Data URI base64)');

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');

  const extMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  const ext = extMap[mimeType.toLowerCase()] || 'jpg';
  const fileName = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const initBody = Buffer.from(JSON.stringify({
    file_name: fileName,
    content_type: mimeType
  }));

  // 1. Intento primario con rest.fal.ai
  let init = await httpsReq('rest.fal.ai', '/storage/upload/initiate', 'POST', {
    'Authorization': 'Key ' + falKey,
    'Content-Type': 'application/json',
    'Content-Length': initBody.length,
  }, initBody);

  // 2. Fallback con rest.alpha.fal.ai
  if (init.status !== 200) {
    init = await httpsReq('rest.alpha.fal.ai', '/storage/upload/initiate', 'POST', {
      'Authorization': 'Key ' + falKey,
      'Content-Type': 'application/json',
      'Content-Length': initBody.length,
    }, initBody);
  }

  if (init.status !== 200) {
    const errDetail = init.body ? init.body.toString().slice(0, 150) : '';
    throw new Error(`Falló la inicialización de subida en storage de fal.ai (${init.status}): ${errDetail}`);
  }

  const { upload_url, file_url } = init.json() || {};
  if (!upload_url || !file_url) {
    throw new Error('Respuesta incompleta de inicialización de subida en fal.ai');
  }

  const u = new URL(upload_url);
  const putRes = await httpsReq(u.hostname, u.pathname + u.search, 'PUT', {
    'Content-Type': mimeType,
    'Content-Length': buffer.length,
  }, buffer);

  if (putRes.status !== 200) {
    const errDetail = putRes.body ? putRes.body.toString().slice(0, 150) : '';
    throw new Error(`Error en subida binaria a fal.ai storage (${putRes.status}): ${errDetail}`);
  }

  return file_url;
}

/**
 * Encola un request de Virtual Try-On en fal.ai (ej: FASHN v1.5)
 */
async function submitTryOn(model = 'fal-ai/fashn/tryon/v1.5', payload, falKey) {
  const preparedPayload = { ...payload };

  // Subir fotos a fal storage si vienen en base64
  const [personURL, garmentURL] = await Promise.all([
    uploadDataURItoFal(preparedPayload.model_image, falKey),
    uploadDataURItoFal(preparedPayload.garment_image, falKey)
  ]);

  preparedPayload.model_image = personURL;
  preparedPayload.garment_image = garmentURL;

  const bodyBuffer = Buffer.from(JSON.stringify(preparedPayload));

  return httpsReq('queue.fal.run', '/' + model, 'POST', {
    'Content-Type': 'application/json',
    'Content-Length': bodyBuffer.length,
    'Authorization': 'Key ' + falKey,
  }, bodyBuffer);
}

/**
 * Consulta el estado de una tarea en la cola de fal.ai
 */
async function getStatus(model = 'fal-ai/fashn/tryon/v1.5', reqId, falKey) {
  return httpsReq('queue.fal.run', '/' + model + '/requests/' + reqId + '/status', 'GET', {
    'Authorization': 'Key ' + falKey,
  }, null);
}

/**
 * Obtiene el resultado final de una tarea de fal.ai
 */
async function getResult(model = 'fal-ai/fashn/tryon/v1.5', reqId, falKey) {
  return httpsReq('queue.fal.run', '/' + model + '/requests/' + reqId, 'GET', {
    'Authorization': 'Key ' + falKey,
  }, null);
}

/**
 * Ejecuta edición de imagen con GPT-Image (GPT-Image-2.5 Flare o GPT-Image-2) en fal.ai
 * Convierte automáticamente imágenes base64 a URLs públicas antes de llamar
 */
async function editGPTImage(payload, falKey, modelRoute = CONFIG.aiModelRoute) {
  const prepared = { ...payload };

  if (Array.isArray(prepared.image_urls) && prepared.image_urls.length > 0) {
    prepared.image_urls = await Promise.all(
      prepared.image_urls.map(img => uploadDataURItoFal(img, falKey))
    );
  }

  const bodyBuffer = Buffer.from(JSON.stringify(prepared));
  const activeRoute = modelRoute || CONFIG.aiModelRoute;
  const route = activeRoute.startsWith('/') ? activeRoute : '/' + activeRoute;

  return httpsReq('fal.run', route, 'POST', {
    'Content-Type': 'application/json',
    'Content-Length': bodyBuffer.length,
    'Authorization': 'Key ' + falKey,
  }, bodyBuffer);
}

module.exports = {
  uploadDataURItoFal,
  submitTryOn,
  getStatus,
  getResult,
  editGPTImage
};
