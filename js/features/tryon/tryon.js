/**
 * js/features/tryon/tryon.js
 * Orquestador del Probador Virtual de IA con polling real, manejo de cuotas,
 * reintentos inteligentes y compresión previa de fotos (<250 líneas).
 */

let tryOnTimer = null;
let tryOnStartTime = 0;
let lastTryOnRequest = null;

function updateElapsedProgressText(customLabel) {
  const elapsed = Math.round((Date.now() - tryOnStartTime) / 1000);
  const pctEl = document.getElementById('tryon-progress-pct');
  if (pctEl) {
    pctEl.textContent = customLabel ? `${customLabel} (${elapsed}s)` : `Procesando… ${elapsed}s`;
  }
}

function startRealTryOnProgress(initialLabel = 'Conectando con IA...') {
  if (typeof setTryOnProcessingState === 'function') setTryOnProcessingState(true);
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  tryOnStartTime = Date.now();
  if (tryOnTimer) clearInterval(tryOnTimer);
  tryOnTimer = setInterval(() => updateElapsedProgressText(), 1000);

  setTryOnStep(1, 20, initialLabel);
}

function setTryOnStep(stepNumber, percent, label) {
  const fill = document.getElementById('tryon-progress-fill');
  if (fill) fill.style.width = `${percent}%`;
  updateElapsedProgressText(label);

  const stepIds = ['chk-step-1', 'chk-step-2', 'chk-step-3', 'chk-step-4', 'chk-step-5'];
  stepIds.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    const iconSpan = el.querySelector('.chk-icon');
    if (idx + 1 < stepNumber) {
      el.className = 'tryon-check-item done';
      if (iconSpan) iconSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (idx + 1 === stepNumber) {
      el.className = 'tryon-check-item active';
      if (iconSpan) iconSpan.innerHTML = `<span class="spin-dot"></span>`;
    } else {
      el.className = 'tryon-check-item';
      if (iconSpan) iconSpan.innerHTML = `<span class="empty-circle"></span>`;
    }
  });
}

function finishRealTryOnProgress() {
  if (tryOnTimer) { clearInterval(tryOnTimer); tryOnTimer = null; }
  const fill = document.getElementById('tryon-progress-fill');
  const pct = document.getElementById('tryon-progress-pct');
  if (fill) fill.style.width = '100%';
  if (pct) pct.textContent = '100% · ¡Listo!';
}

function stopRealTryOnProgress() {
  if (tryOnTimer) { clearInterval(tryOnTimer); tryOnTimer = null; }
  if (typeof setTryOnProcessingState === 'function') setTryOnProcessingState(false);
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

function showTryOnError(message, canRetry = true) {
  stopRealTryOnProgress();
  const errBox = document.getElementById('error-box');
  const errMsg = document.getElementById('error-msg');
  if (errMsg) errMsg.textContent = message;

  // Botón de reintento inteligente
  let retryBtn = document.getElementById('btn-tryon-retry');
  if (!retryBtn && errBox) {
    retryBtn = document.createElement('button');
    retryBtn.id = 'btn-tryon-retry';
    retryBtn.className = 'btn-hero-secondary';
    retryBtn.style.cssText = 'margin-top:10px;padding:8px 18px;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;';
    retryBtn.innerHTML = '🔄 Reintentar prueba';
    retryBtn.onclick = () => retryLastTryOn();
    errBox.appendChild(retryBtn);
  }
  if (retryBtn) retryBtn.style.display = canRetry && lastTryOnRequest ? 'inline-flex' : 'none';
  if (errBox) errBox.style.display = 'flex';
}

function showPhotoFallback(photoDataURL) {
  stopRealTryOnProgress();
  const ri = document.getElementById('result-img');
  if (!ri) return;

  ri.src = photoDataURL;
  ri.style.display = 'block';

  // Mostrar banner de advertencia visual
  let fbNotice = document.getElementById('tryon-fallback-notice');
  const box = document.getElementById('camera-box');
  if (!fbNotice && box) {
    fbNotice = document.createElement('div');
    fbNotice.id = 'tryon-fallback-notice';
    fbNotice.style.cssText = 'position:absolute;bottom:12px;left:12px;right:12px;background:rgba(239,68,68,0.95);color:#fff;padding:10px 14px;border-radius:12px;font-size:0.8rem;font-weight:600;display:flex;align-items:center;justify-content:space-between;z-index:30;box-shadow:0 4px 14px rgba(0,0,0,0.3);';
    fbNotice.innerHTML = `
      <span>⚠️ No pudimos procesar tu foto con IA — mostrando tu foto original</span>
      <button onclick="retryLastTryOn()" style="background:#fff;color:#dc2626;border:none;padding:5px 12px;border-radius:8px;font-weight:700;font-size:0.75rem;cursor:pointer;">Reintentar</button>
    `;
    box.appendChild(fbNotice);
  }
  if (fbNotice) fbNotice.style.display = 'flex';
}

async function retryLastTryOn() {
  const errBox = document.getElementById('error-box');
  if (errBox) errBox.style.display = 'none';
  const fbNotice = document.getElementById('tryon-fallback-notice');
  if (fbNotice) fbNotice.style.display = 'none';

  if (!lastTryOnRequest) {
    if (typeof retryPhoto === 'function') retryPhoto();
    return;
  }

  // Reejecutar con la foto ya capturada
  await runVirtualTryOn(lastTryOnRequest.photoDataURL, lastTryOnRequest.garmentImgPath, lastTryOnRequest.reqId);
}

// Helper para extraer URL de imagen de respuesta
function extractImageUrl(data) {
  if (!data) return null;
  if (Array.isArray(data.images) && data.images.length > 0) {
    const first = data.images[0];
    return typeof first === 'string' ? first : first.url;
  }
  if (data.image) return typeof data.image === 'string' ? data.image : data.image.url;
  if (Array.isArray(data.data) && data.data.length > 0) {
    const first = data.data[0];
    return typeof first === 'string' ? first : (first.url || (first.b64_json ? `data:image/jpeg;base64,${first.b64_json}` : null));
  }
  if (typeof data.url === 'string' && data.url.startsWith('http')) return data.url;
  if (data.output) return extractImageUrl(data.output);
  if (data.result) return extractImageUrl(data.result);
  return null;
}

// ── ENTRADA PRINCIPAL DEL TRY-ON ──
async function runVirtualTryOn(photoDataURL, garmentImgPath, existingReqId = null) {
  window.lastUserPhoto = photoDataURL;
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  const tipo = item?.tipo || 'gorra';
  const fbNotice = document.getElementById('tryon-fallback-notice');
  if (fbNotice) fbNotice.style.display = 'none';

  startRealTryOnProgress(CONFIG.uiMessages?.uploadingAndQueuing || 'Comprimiendo y preparando imagen...');

  try {
    // 1. Compresión en cliente para prevenir 413
    const compressedPhoto = (typeof comprimirFoto === 'function')
      ? await comprimirFoto(photoDataURL, 1024, 0.85)
      : photoDataURL;

    lastTryOnRequest = { photoDataURL: compressedPhoto, garmentImgPath, reqId: existingReqId };

    // 2. Cargar imagen del producto
    let garmentDataURI;
    try {
      garmentDataURI = await cargarImagenComoDataURI(garmentImgPath);
    } catch (e) {
      showTryOnError('No se pudo cargar la imagen del producto.');
      return;
    }

    // 3. Despachar a motor activo
    if ((CONFIG.aiModel && CONFIG.aiModel.startsWith('gpt-image')) || CONFIG.aiModel === 'gpt-image-2.5-flare') {
      await executeGptImage2TryOn(compressedPhoto, garmentDataURI, tipo);
    } else {
      await executeFashnTryOn(compressedPhoto, garmentDataURI, existingReqId);
    }

    if (typeof setWhatsAppLink === 'function') setWhatsAppLink();
  } catch (err) {
    console.error('[TryOn Error]', err);
    showTryOnError(err.message || 'Error al procesar la imagen con la IA');
  }
}

async function executeGptImage2TryOn(photo, garment, tipo) {
  setTryOnStep(2, 45, 'Enviando a fal.ai...');
  const proxy = CONFIG.proxyBase || '';
  const storeId = (window.Store && Store.getCurrentStoreId) ? Store.getCurrentStoreId() : '';
  const prompt = (CONFIG.getPromptParaPrenda ? CONFIG.getPromptParaPrenda(tipo) : null)
    || CONFIG.promptsPorTipo?.[tipo]
    || CONFIG.promptsPorTipo?.default
    || 'Pone la prenda a esta persona';

  const url = `${proxy}/api/gpt/edit${storeId ? `?store=${encodeURIComponent(storeId)}` : ''}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_urls: [photo, garment],
      quality: CONFIG.aiQuality || 'low',
      image_size: CONFIG.aiImageSize || 'auto',
      output_compression: 80,
      output_format: 'jpeg'
    }),
  });

  if (resp.status === 429) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error || 'Límite mensual de IA alcanzado para esta tienda.');
  }

  if (!resp.ok) {
    const t = await resp.text();
    let errMsg = `Error GPT-Image-2 (${resp.status})`;
    try {
      const parsed = JSON.parse(t);
      errMsg = parsed.error || errMsg;
    } catch (_) {
      if (t.includes('<!doctype') || t.includes('<html')) {
        errMsg = `Error del servidor (${resp.status})`;
      } else {
        errMsg = t.slice(0, 200);
      }
    }
    throw new Error(errMsg);
  }

  setTryOnStep(3, 85, 'Descargando resultado...');
  const contentType = resp.headers.get('content-type') || '';
  let data;
  if (!contentType.includes('application/json')) {
    throw new Error('Respuesta inválida del servidor (no es JSON)');
  } else {
    data = await resp.json();
  }
  const imgURL = extractImageUrl(data);
  if (!imgURL) throw new Error('No se recibió una URL de imagen válida.');

  if (window.Store && Store.syncCurrentStore) Store.syncCurrentStore();
  finishRealTryOnProgress();
  mostrarResultado(imgURL);
}

async function executeFashnTryOn(photo, garment, existingReqId = null) {
  const proxy = CONFIG.proxyBase || '';
  const storeId = (window.Store && Store.getCurrentStoreId) ? Store.getCurrentStoreId() : '';
  const model = CONFIG.aiModel === 'fashn-v1.6' ? 'fal-ai/fashn/tryon/v1.6' : 'fal-ai/fashn/tryon/v1.5';

  let reqId = existingReqId;

  if (!reqId) {
    setTryOnStep(1, 30, 'Enviando a cola de procesamiento...');
    const submitUrl = `${proxy}/api/fal/submit?model=${encodeURIComponent(model)}${storeId ? `&store=${encodeURIComponent(storeId)}` : ''}`;
    const submitResp = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_image: photo, garment_image: garment, category: 'tops' }),
    });

    if (submitResp.status === 429) {
      const errData = await submitResp.json().catch(() => ({}));
      throw new Error(errData.error || 'Límite mensual alcanzado para esta tienda.');
    }
    if (!submitResp.ok) throw new Error(`Error al enviar a FASHN (${submitResp.status})`);

    const submitData = await submitResp.json();
    reqId = submitData.request_id;
    if (lastTryOnRequest) lastTryOnRequest.reqId = reqId;

    if (!reqId) {
      const direct = extractImageUrl(submitData);
      if (direct) { finishRealTryOnProgress(); mostrarResultado(direct); return; }
      throw new Error('FASHN no devolvió request_id.');
    }
  }

  // Polling con estados reales (IN_QUEUE / IN_PROGRESS / COMPLETED)
  let status = 'IN_QUEUE';
  let attempts = 0;
  const maxAttempts = 30;

  while (status !== 'COMPLETED' && attempts < maxAttempts) {
    attempts++;
    await new Promise(r => setTimeout(r, 2000));

    const statusUrl = `${proxy}/api/fal/status?model=${encodeURIComponent(model)}&reqId=${encodeURIComponent(reqId)}`;
    const statusResp = await fetch(statusUrl);
    if (statusResp.ok) {
      const sData = await statusResp.json();
      status = sData.status || status;

      if (status === 'IN_QUEUE') {
        setTryOnStep(2, 40, 'En cola en fal.ai...');
      } else if (status === 'IN_PROGRESS') {
        setTryOnStep(2, 75, 'Generando prenda y ajustando rostro...');
      } else if (status === 'FAILED') {
        throw new Error('El procesamiento en fal.ai falló.');
      }
    }
  }

  // Si a los 60s no completó, intentar 2 veces más el endpoint result antes de fallar
  let imgURL = null;
  const resultUrl = `${proxy}/api/fal/result?model=${encodeURIComponent(model)}&reqId=${encodeURIComponent(reqId)}`;

  for (let extra = 1; extra <= 2; extra++) {
    setTryOnStep(3, 90, `Consultando resultado (intento ${extra})...`);
    const rResp = await fetch(resultUrl);
    if (rResp.ok) {
      const rData = await rResp.json();
      imgURL = extractImageUrl(rData);
      if (imgURL) break;
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!imgURL) {
    throw new Error('Tiempo de espera agotado. Podés pulsar "Reintentar" para chequear de nuevo.');
  }

  if (window.Store && Store.syncCurrentStore) Store.syncCurrentStore();
  finishRealTryOnProgress();
  mostrarResultado(imgURL);
}

window.runVirtualTryOn = runVirtualTryOn;
window.startTryOnProgress = startRealTryOnProgress;
window.finishTryOnProgress = finishRealTryOnProgress;
window.stopTryOnProgress = stopRealTryOnProgress;
window.retryLastTryOn = retryLastTryOn;
window.showPhotoFallback = showPhotoFallback;
