
let tryOnProgressInterval = null;

function setTryOnProcessingState(isProcessing) {
  const btnRestart = document.getElementById('btn-restart-tryon') || document.querySelector('.btn-restart-tryon');
  const btnAct = document.getElementById('btn-activate');
  const btnShoot = document.getElementById('btn-shoot');
  const uploadLabel = document.querySelector('.btn-upload-gallery-sec');
  const uploadInput = document.getElementById('tryon-gallery-input');
  const liveTools = document.getElementById('cam-live-tools');
  const guideOverlay = document.getElementById('camera-guide-overlay');

  if (isProcessing) {
    if (btnRestart) btnRestart.style.display = 'none';
    if (btnAct) btnAct.style.display = 'none';
    if (btnShoot) btnShoot.style.display = 'none';
    if (uploadLabel) {
      uploadLabel.style.pointerEvents = 'none';
      uploadLabel.style.opacity = '0.4';
    }
    if (uploadInput) uploadInput.disabled = true;
    if (liveTools) liveTools.style.display = 'none';
    if (guideOverlay) guideOverlay.style.display = 'none';
  } else {
    if (btnRestart) btnRestart.style.display = 'inline-flex';
    if (uploadLabel) {
      uploadLabel.style.pointerEvents = 'auto';
      uploadLabel.style.opacity = '1';
    }
    if (uploadInput) uploadInput.disabled = false;
    const video = document.getElementById('video-feed');
    if (video && video.style.display === 'block') {
      if (btnShoot) btnShoot.style.display = 'inline-flex';
    } else {
      if (btnAct) btnAct.style.display = 'inline-flex';
    }
  }
}

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

function startTryOnProgress(initialLabel = 'Conectando con IA...') {
  setTryOnProcessingState(true);
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  tryOnStartTime = Date.now();
  if (tryOnProgressInterval) clearInterval(tryOnProgressInterval);
  if (tryOnTimer) clearInterval(tryOnTimer);
  tryOnTimer = setInterval(() => updateElapsedProgressText(), 1000);

  const fill = document.getElementById('tryon-progress-fill');
  if (fill) fill.style.width = '15%';
  updateElapsedProgressText(initialLabel);
  setStep(1);
}

function finishTryOnProgress() {
  if (tryOnProgressInterval) clearInterval(tryOnProgressInterval);
  if (tryOnTimer) { clearInterval(tryOnTimer); tryOnTimer = null; }
  const fill = document.getElementById('tryon-progress-fill');
  const pct = document.getElementById('tryon-progress-pct');
  const stepIds = ['chk-step-1', 'chk-step-2', 'chk-step-3', 'chk-step-4', 'chk-step-5'];

  if (fill) fill.style.width = '100%';
  if (pct) pct.textContent = '100% · ¡Listo!';

  stepIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'tryon-check-item done';
    const iconSpan = el.querySelector('.chk-icon');
    if (iconSpan) iconSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
  });
}

function resetResult() {
  const resultImg = document.getElementById('result-img');
  if (resultImg) resultImg.style.display = 'none';
  const errorBox = document.getElementById('error-box');
  if (errorBox) errorBox.style.display = 'none';
  const ph = document.getElementById('cam-placeholder');
  if (ph) ph.style.display = 'none';
  const video = document.getElementById('video-feed');
  if (video) video.style.display = 'none';
  startTryOnProgress();
  setStep(1);
}

function setStep(n, customLabel = null) {
  const stepIds = ['chk-step-1', 'chk-step-2', 'chk-step-3', 'chk-step-4', 'chk-step-5'];
  const pcts = [20, 45, 75, 90, 100];
  const fill = document.getElementById('tryon-progress-fill');
  if (fill && pcts[n - 1] !== undefined) {
    fill.style.width = `${pcts[n - 1]}%`;
  }
  if (customLabel) {
    updateElapsedProgressText(customLabel);
  }

  stepIds.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (!el) return;
    const iconSpan = el.querySelector('.chk-icon');
    if (idx + 1 < n) {
      el.className = 'tryon-check-item done';
      if (iconSpan) iconSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (idx + 1 === n) {
      el.className = 'tryon-check-item active';
      if (iconSpan) iconSpan.innerHTML = `<span class="spin-dot"></span>`;
    } else {
      el.className = 'tryon-check-item';
      if (iconSpan) iconSpan.innerHTML = `<span class="empty-circle"></span>`;
    }
  });

  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`ls-${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < n)        el.classList.add('done');
    else if (i === n) el.classList.add('active');
  }
}

function showError(msg, canRetry = true) {
  if (tryOnTimer) { clearInterval(tryOnTimer); tryOnTimer = null; }
  setTryOnProcessingState(false);
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
  const errorMsg = document.getElementById('error-msg');
  if (errorMsg) errorMsg.textContent = msg;
  const errorBox = document.getElementById('error-box');

  let retryBtn = document.getElementById('btn-tryon-retry');
  if (!retryBtn && errorBox) {
    retryBtn = document.createElement('button');
    retryBtn.id = 'btn-tryon-retry';
    retryBtn.className = 'btn-hero-secondary';
    retryBtn.style.cssText = 'margin-top:10px;padding:8px 18px;font-size:0.85rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;';
    retryBtn.innerHTML = '🔄 Reintentar prueba';
    retryBtn.onclick = () => retryLastTryOn();
    errorBox.appendChild(retryBtn);
  }
  if (retryBtn) retryBtn.style.display = canRetry && lastTryOnRequest ? 'inline-flex' : 'none';
  if (errorBox) errorBox.style.display = 'flex';
}

async function retryLastTryOn() {
  const errorBox = document.getElementById('error-box');
  if (errorBox) errorBox.style.display = 'none';
  const fbNotice = document.getElementById('tryon-fallback-notice');
  if (fbNotice) fbNotice.style.display = 'none';

  if (!lastTryOnRequest) {
    if (typeof retryPhoto === 'function') retryPhoto();
    return;
  }
  await runVirtualTryOn(lastTryOnRequest.photoDataURL, lastTryOnRequest.garmentImgPath, lastTryOnRequest.reqId);
}

// Muestra la foto original sin editar como fallback con banner y botón de reintento
function showPhotoFallback(photoDataURL) {
  console.warn('[tryon] Mostrando foto original como fallback');
  if (tryOnTimer) { clearInterval(tryOnTimer); tryOnTimer = null; }
  setTryOnProcessingState(false);
  const ri = document.getElementById('result-img');
  if (!ri) return;
  ri.src = photoDataURL;
  ri.onload = () => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
    ri.style.display = 'block';

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
  };
}

// Carga imagen como data URI desde una ruta local
async function cargarImagenComoDataURI(path) {
  const r    = await fetch(path);
  const blob = await r.blob();
  return new Promise((res, rej) => {
    const rd = new FileReader();
    rd.onloadend = () => res(rd.result);
    rd.onerror   = rej;
    rd.readAsDataURL(blob);
  });
}

// Setea el link de WhatsApp con la gorra activa
function setWhatsAppLink() {
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  const precioFormatted = window.formatPrecio ? window.formatPrecio(item?.precio || 0) : ('$' + (item?.precio || 0));
  const msg = item
    ? `Hola! Vi *${item.nombre}* en CAPFIT (${precioFormatted}) y me encantó. ¡Quiero comprarlo!`
    : CONFIG.whatsappMsg;
  const waBtn = document.getElementById('whatsapp-btn');
  if (waBtn) {
    waBtn.href = 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg);
  }
}

const PROMPTS_POR_TIPO = {
  gorra: 'Pone la gorra a esta persona',
  anteojo: 'Pone los anteojos a esta persona',
  anteojos: 'Pone los anteojos a esta persona',
  gorro: 'Pone el gorro a esta persona',
  remera: 'Pone la remera a esta persona',
  buzo: 'Pone el buzo a esta persona',
  campera: 'Pone la campera a esta persona',
  pantalon: 'Pone el pantalón a esta persona',
  default: 'Pone la prenda a esta persona',
};

function getPromptParaTipo(tipo) {
  if (CONFIG.getPromptParaPrenda) {
    return CONFIG.getPromptParaPrenda(tipo);
  }
  const t = String(tipo || '').toLowerCase().trim();
  return (CONFIG.promptsPorTipo && CONFIG.promptsPorTipo[t])
    || PROMPTS_POR_TIPO[t]
    || (CONFIG.promptsPorTipo && CONFIG.promptsPorTipo.default)
    || PROMPTS_POR_TIPO.default;
}

// Helper para extraer URL de imagen de cualquier estructura de respuesta de fal.ai / OpenAI
function extractImageUrl(data) {
  if (!data) return null;

  // 1. Array in data.images (ej: { images: [{ url: "..." }] } o { images: ["https://..."] })
  if (Array.isArray(data.images) && data.images.length > 0) {
    const first = data.images[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && first.url) return first.url;
  }

  // 2. Single data.image (ej: { image: { url: "..." } } o { image: "https://..." })
  if (data.image) {
    if (typeof data.image === 'string') return data.image;
    if (typeof data.image === 'object' && data.image.url) return data.image.url;
  }

  // 3. Array in data.data (ej: { data: [{ url: "..." }] })
  if (Array.isArray(data.data) && data.data.length > 0) {
    const first = data.data[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      if (first.url) return first.url;
      if (first.b64_json) return `data:image/jpeg;base64,${first.b64_json}`;
    }
  }

  // 4. Direct top-level url property
  if (typeof data.url === 'string' && data.url.startsWith('http')) return data.url;

  // 5. Nested in output or result
  if (data.output) {
    const nested = extractImageUrl(data.output);
    if (nested) return nested;
  }
  if (data.result) {
    const nested = extractImageUrl(data.result);
    if (nested) return nested;
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ENTRADA PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runVirtualTryOn(photoDataURL, garmentImgPath, existingReqId = null) {
  window.lastUserPhoto = photoDataURL;
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  const tipo = item?.tipo || 'gorra';
  const fbNotice = document.getElementById('tryon-fallback-notice');
  if (fbNotice) fbNotice.style.display = 'none';

  console.log('[TRYON] ========== INICIO ==========');
  console.log('[TRYON] Motor activo:', CONFIG.aiModel);
  console.log('[TRYON] Tipo de producto:', tipo);
  console.log('[TRYON] proxyBase:', CONFIG.proxyBase);
  console.log('[TRYON] garmentImgPath:', garmentImgPath);

  startTryOnProgress(CONFIG.uiMessages?.uploadingAndQueuing || 'Comprimiendo y preparando imagen...');

  try {
    setStep(1, 'Comprimiendo y preparando imagen...');

    // 1. Compresión en cliente para prevenir 413
    let compressedPhoto = photoDataURL;
    if (typeof window.comprimirFoto === 'function') {
      try {
        compressedPhoto = await window.comprimirFoto(photoDataURL, 1024, 0.85);
      } catch (e) {
        console.warn('[TRYON] Error en comprimirFoto, usando imagen directa:', e);
      }
    }

    lastTryOnRequest = { photoDataURL: compressedPhoto, garmentImgPath, reqId: existingReqId };

    console.log('[TRYON] Step 1: Cargando imagen del producto...');

    let garmentDataURI;
    try {
      garmentDataURI = await cargarImagenComoDataURI(garmentImgPath);
      console.log('[TRYON] Imagen cargada OK, length:', garmentDataURI.length);
    } catch (e) {
      console.error('[TRYON] ERROR cargando imagen del producto:', e);
      finishTryOnProgress();
      showError('No se pudo cargar la imagen del producto.');
      setWhatsAppLink();
      return;
    }

    console.log('[TRYON] Dispatching a motor:', CONFIG.aiModel);
    if ((CONFIG.aiModel && CONFIG.aiModel.startsWith('gpt-image')) || CONFIG.aiModel === 'gpt-image-2.5-flare') {
      await runGPTImage2(compressedPhoto, garmentDataURI, tipo);
    } else {
      await runFASHN(compressedPhoto, garmentDataURI, existingReqId);
    }

    setWhatsAppLink();
    console.log('[TRYON] ========== FIN OK ==========');

  } catch (err) {
    console.error('[TRYON] ========== ERROR GENERAL ==========');
    console.error('[TRYON]', err);
    finishTryOnProgress();
    showError(err.message || 'Error al procesar la imagen con la IA');
    setWhatsAppLink();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GPT-IMAGE (fal.ai / openai / gpt-image-2.5-flare / edit)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runGPTImage2(photoDataURL, garmentDataURI, tipo) {
  const proxy = CONFIG.proxyBase;
  const storeId = (window.Store && Store.getCurrentStoreId) ? Store.getCurrentStoreId() : '';
  console.log('[GPT2] Iniciando, proxy:', proxy, '| storeId:', storeId);

  setStep(2, 'Conectando con modelo de IA...');

  const prompt = (CONFIG.getPromptParaPrenda ? CONFIG.getPromptParaPrenda(tipo) : null)
    || (CONFIG.promptsPorTipo && CONFIG.promptsPorTipo[tipo])
    || getPromptParaTipo(tipo);
  console.log('[GPT2] Tipo:', tipo, '| Prompt:', prompt);

  const payload = {
    prompt,
    image_urls: [photoDataURL, garmentDataURI],
    quality: CONFIG.aiQuality || 'low',
    image_size: CONFIG.aiImageSize || 'auto',
    output_compression: 80,
    output_format: 'jpeg',
  };

  const url = `${proxy}/api/gpt/edit${storeId ? `?store=${encodeURIComponent(storeId)}` : ''}`;
  console.log('[GPT2] Fetching:', url);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('[GPT2] Response status:', resp.status);

    if (resp.status === 429) {
      let errData = {};
      try { errData = await resp.json(); } catch(e) {}
      const msg = errData.error || 'Esta tienda alcanzó su límite mensual de 100 fotos con IA.';
      throw new Error(msg);
    }

    setStep(3, 'Generando prenda y ajustando iluminación...');

    if (!resp.ok) {
      const t = await resp.text();
      let errMsg = `Error (${resp.status})`;
      try {
        const parsed = JSON.parse(t);
        errMsg = parsed.error || errMsg;
      } catch (_) {
        if (t.includes('<!doctype') || t.includes('<html')) {
          errMsg = `El servidor devolvió un error inesperado (código ${resp.status})`;
        } else {
          errMsg = t.slice(0, 200);
        }
      }
      console.error('[GPT2] ERROR HTTP', resp.status, ':', errMsg);
      throw new Error(errMsg);
    }

    const contentType = resp.headers.get('content-type') || '';
    let data;
    if (!contentType.includes('application/json')) {
      const raw = await resp.text();
      console.error('[GPT2] Se esperaba JSON pero se recibió:', contentType, raw.slice(0, 300));
      throw new Error('Respuesta inválida del servidor (formato no esperado)');
    } else {
      data = await resp.json();
    }
    console.log('[GPT2] Response data:', data);

    const imgURL = extractImageUrl(data);
    console.log('[GPT2] imgURL encontrada:', imgURL ? 'SÍ (' + imgURL.slice(0, 60) + '...)' : 'NO');

    if (!imgURL) {
      console.error('[GPT2] No imgURL en respuesta. Estructura:', data);
      throw new Error('GPT-Image-2 no devolvió URL de imagen válida');
    }

    // Sincronizar cuota de IA consumida
    if (window.Store && Store.syncCurrentStore) {
      Store.syncCurrentStore().then(() => {
        if (window.updateTryOnQuotaUI) window.updateTryOnQuotaUI();
      });
    }

    setStep(4, 'Descargando resultado final...');
    mostrarResultado(imgURL);
    console.log('[GPT2] Resultado mostrado correctamente');

  } catch (e) {
    console.error('[GPT2] ERROR en fetch:', e);
    throw e;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FASHN TRY-ON (fal-ai/fashn/tryon)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runFASHN(photoDataURL, garmentDataURI, existingReqId = null) {
  const proxy = CONFIG.proxyBase;
  const storeId = (window.Store && Store.getCurrentStoreId) ? Store.getCurrentStoreId() : '';
  const model = CONFIG.aiModel === 'fashn-v1.6'
    ? 'fal-ai/fashn/tryon/v1.6'
    : 'fal-ai/fashn/tryon/v1.5';

  console.log('[FASHN] Iniciando try-on con modelo:', model, '| storeId:', storeId);

  let reqId = existingReqId;

  if (!reqId) {
    setStep(2, 'Enviando imagen a cola de procesamiento en fal.ai...');

    const payload = {
      model_image: photoDataURL,
      garment_image: garmentDataURI,
      category: 'tops',
    };

    const submitUrl = `${proxy}/api/fal/submit?model=${encodeURIComponent(model)}${storeId ? `&store=${encodeURIComponent(storeId)}` : ''}`;
    const submitResp = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (submitResp.status === 429) {
      let errData = {};
      try { errData = await submitResp.json(); } catch(e) {}
      const msg = errData.error || 'Esta tienda alcanzó su límite mensual de 100 fotos con IA.';
      throw new Error(msg);
    }

    if (!submitResp.ok) {
      const errTxt = await submitResp.text();
      let errMsg = `Error FASHN submit (${submitResp.status})`;
      try {
        const parsed = JSON.parse(errTxt);
        errMsg = parsed.error || errMsg;
      } catch (_) {
        if (errTxt.includes('<!doctype') || errTxt.includes('<html')) {
          errMsg = `El servidor devolvió un error inesperado (código ${submitResp.status})`;
        } else {
          errMsg = errTxt.slice(0, 200);
        }
      }
      throw new Error(errMsg);
    }

    const submitContentType = submitResp.headers.get('content-type') || '';
    let submitData;
    if (!submitContentType.includes('application/json')) {
      throw new Error('Respuesta no válida del servidor al enviar a FASHN');
    } else {
      submitData = await submitResp.json();
    }
    reqId = submitData.request_id;
    if (lastTryOnRequest) lastTryOnRequest.reqId = reqId;

    if (!reqId) {
      const directUrl = extractImageUrl(submitData);
      if (directUrl) {
        setStep(4, 'Listo');
        mostrarResultado(directUrl);
        return;
      }
      throw new Error('FASHN no devolvió request_id');
    }
  }

  setStep(2, 'En cola de procesamiento en fal.ai…');
  let status = 'IN_QUEUE';
  let attempts = 0;
  const maxAttempts = 30;

  while (status !== 'COMPLETED' && attempts < maxAttempts) {
    attempts++;
    await new Promise(r => setTimeout(r, 2000));

    const statusUrl = `${proxy}/api/fal/status?model=${encodeURIComponent(model)}&reqId=${encodeURIComponent(reqId)}`;
    const statusResp = await fetch(statusUrl);
    if (statusResp.ok) {
      const statusData = await statusResp.json();
      status = statusData.status || status;
      console.log(`[FASHN] Status attempt ${attempts}:`, status);

      if (status === 'IN_QUEUE') {
        setStep(2, `En cola de procesamiento en fal.ai…`);
      } else if (status === 'IN_PROGRESS') {
        setStep(3, `Generando prenda y ajustando rostro…`);
      } else if (status === 'FAILED') {
        throw new Error('El procesamiento en fal.ai falló en el servidor');
      }
    }
  }

  // Si a los 60s no completó el status, intentar 2 veces más el endpoint result con 3s de pausa
  let imgURL = null;
  const resultUrl = `${proxy}/api/fal/result?model=${encodeURIComponent(model)}&reqId=${encodeURIComponent(reqId)}`;

  for (let extra = 1; extra <= 2; extra++) {
    setStep(3, `Consultando resultado final (intento ${extra})...`);
    const resultResp = await fetch(resultUrl);
    if (resultResp.ok) {
      const resultData = await resultResp.json();
      imgURL = extractImageUrl(resultData);
      if (imgURL) break;
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!imgURL) {
    throw new Error('Tiempo de espera agotado. Podés pulsar "Reintentar" para verificar nuevamente el resultado.');
  }

  // Sincronizar cuota de IA consumida
  if (window.Store && Store.syncCurrentStore) {
    Store.syncCurrentStore().then(() => {
      if (window.updateTryOnQuotaUI) window.updateTryOnQuotaUI();
    });
  }

  setStep(4, 'Renderizando resultado...');
  mostrarResultado(imgURL);
}

// ── Mostrar imagen resultado ──
function mostrarResultado(imgURL) {
  console.log('[TRYON] Mostrando resultado final:', imgURL);
  finishTryOnProgress();
  const ri = document.getElementById('result-img');
  if (!ri) return;

  const overlay = document.getElementById('loading-overlay');
  const ph = document.getElementById('cam-placeholder');
  const video = document.getElementById('video-feed');
  const resActions = document.getElementById('tryon-result-actions');
  const capNameEl = document.getElementById('buy-now-cap-name');

  // Update cap name in buy-now card
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  if (capNameEl && item) {
    const formattedPrice = typeof formatPrice === 'function' ? formatPrice(item.precio) : `$${item.precio}`;
    capNameEl.textContent = `${item.nombre} · ${formattedPrice}`;
  }

  // Asegurar que se oculten placeholders y cámara activa
  if (ph) ph.style.display = 'none';
  if (video) video.style.display = 'none';

  const onResultReady = () => {
    console.log('[TRYON] Imagen cargada e insertada en DOM con éxito');
    setTryOnProcessingState(false);
    if (overlay) overlay.style.display = 'none';
    if (ph) ph.style.display = 'none';
    if (video) video.style.display = 'none';
    ri.style.display = 'block';
    if (resActions) resActions.style.display = 'flex';
  };

  ri.onload = onResultReady;

  ri.onerror = (err) => {
    console.warn('[TRYON] Error al cargar URL de imagen resultado:', err);
    if (overlay) overlay.style.display = 'none';
    showError('No se pudo renderizar la imagen devuelta por la IA.');
  };

  ri.src = imgURL;

  if (ri.complete && ri.naturalWidth > 0) {
    onResultReady();
  }
}

// ── Comprar gorra directo desde resultado ──
function comprarGorraDirecto() {
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  if (!item) {
    alert('Seleccioná una gorra del catálogo.');
    return;
  }
  if (window.Cart && Cart.addToCart) {
    Cart.addToCart(item, 1);
  }
  if (typeof navigateToView === 'function') {
    navigateToView('carrito');
  }
}

// ── Marca de agua para descarga y compartir ──
function createWatermarkedCanvas(imgSrc) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || 800;
      const h = img.naturalHeight || 1066;

      const bannerHeight = Math.round(w * 0.16);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h + bannerHeight;

      const ctx = canvas.getContext('2d');

      // 1. Main Photo
      ctx.drawImage(img, 0, 0, w, h);

      // 2. Footer Banner
      const bannerY = h;
      const grad = ctx.createLinearGradient(0, bannerY, 0, bannerY + bannerHeight);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, bannerY, w, bannerHeight);

      // Accent Green Line
      ctx.fillStyle = '#10b981';
      ctx.fillRect(0, bannerY, w, Math.max(3, Math.round(w * 0.006)));

      // 3. CAPFIT Brand Title
      const padding = Math.round(w * 0.04);
      ctx.font = `900 ${Math.round(w * 0.055)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText('CAPFIT', padding, bannerY + bannerHeight * 0.38);

      // AI Badge
      const capfitWidth = ctx.measureText('CAPFIT').width;
      ctx.font = `700 ${Math.round(w * 0.026)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#10b981';
      ctx.fillText('● PROBADOR VIRTUAL IA', padding + capfitWidth + Math.round(w * 0.03), bannerY + bannerHeight * 0.38);

      // Active Cap Name & Web Domain Subtitle
      const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : null;
      const capName = item ? item.nombre : 'Gorra CapFit';

      ctx.font = `600 ${Math.round(w * 0.03)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillText(`${capName} · capfit.store`, padding, bannerY + bannerHeight * 0.72);

      // Right watermark callout
      ctx.textAlign = 'right';
      ctx.font = `800 ${Math.round(w * 0.032)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillText('Probátela en vivo', w - padding, bannerY + bannerHeight * 0.55);

      resolve(canvas);
    };
    img.onerror = (err) => reject(err);
    img.src = imgSrc;
  });
}

async function downloadWatermarkedResult() {
  const ri = document.getElementById('result-img');
  if (!ri || !ri.src) {
    alert('No hay ninguna foto procesada para descargar.');
    return;
  }

  try {
    const canvas = await createWatermarkedCanvas(ri.src);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : null;
    const filename = `capfit-${item ? item.id : 'tryon'}-ia.jpg`;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.warn('[Watermark Download Error]', err);
    const a = document.createElement('a');
    a.href = ri.src;
    a.download = 'capfit-tryon.jpg';
    a.click();
  }
}

async function shareWatermarkedResult() {
  const ri = document.getElementById('result-img');
  if (!ri || !ri.src) {
    if (navigator.share) {
      navigator.share({ title: 'CAPFIT Probador Virtual', url: window.location.href });
    } else {
      alert('Enlace copiado al portapapeles');
    }
    return;
  }

  try {
    const canvas = await createWatermarkedCanvas(ri.src);
    canvas.toBlob(async (blob) => {
      if (blob && navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'capfit-tryon.jpg', { type: 'image/jpeg' })] })) {
        const file = new File([blob], 'capfit-tryon.jpg', { type: 'image/jpeg' });
        await navigator.share({
          title: '¡Mirá cómo me queda esta gorra en CAPFIT!',
          text: 'Me probé esta gorra con el probador virtual IA de CAPFIT.',
          files: [file]
        });
      } else {
        downloadWatermarkedResult();
      }
    }, 'image/jpeg', 0.92);
  } catch (err) {
    console.warn('[Watermark Share Error]', err);
    downloadWatermarkedResult();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PROCESAMIENTO Y VALIDACIÓN DE IMÁGENES SUBIDAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function processUploadedImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error('No se seleccionó ningún archivo.'));
    }

    const nameLower = (file.name || '').toLowerCase();
    const typeLower = (file.type || '').toLowerCase();

    // 1. Detectar HEIC/HEIF de iOS/iPhone
    if (nameLower.endsWith('.heic') || nameLower.endsWith('.heif') || typeLower.includes('heic') || typeLower.includes('heif')) {
      return reject(new Error('El formato HEIC/HEIF de iPhone no se puede procesar directamente en el navegador. Por favor guardá la foto como JPG, PNG o WebP, o sacate una foto directamente con la cámara.'));
    }

    // 2. Validar formatos estándar compatibles
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const hasValidExt = allowedExts.some(ext => nameLower.endsWith(ext));
    const hasValidType = allowedTypes.includes(typeLower);

    if (file.type && !hasValidType && !hasValidExt) {
      return reject(new Error('Formato no soportado. Por favor elegí una imagen en formato JPG, PNG o WebP.'));
    }

    // 3. Lectura, compresión y redimensionamiento en cliente (Ancho máx: 720px)
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer el archivo seleccionado.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo cargar la imagen. Verificá que el archivo sea una imagen válida.'));
      img.onload = async () => {
        try {
          const MAX_WIDTH = 576;
          const TARGET_RATIO = 4 / 3; // H/W = 4/3 (3:4 portrait)
          const width = MAX_WIDTH;
          const height = Math.round(MAX_WIDTH * TARGET_RATIO); // 768

          const origW = img.naturalWidth || img.width;
          const origH = img.naturalHeight || img.height;

          const origAspect = origW / origH;
          const targetAspect = width / height;

          let sx = 0, sy = 0, sWidth = origW, sHeight = origH;
          if (origAspect > targetAspect) {
            sWidth = origH * targetAspect;
            sx = (origW - sWidth) / 2;
          } else {
            sHeight = origW / targetAspect;
            sy = (origH - sHeight) / 2;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, width, height);

          // Verificar si hay un rostro en la imagen subida
          if (typeof FaceDetection !== 'undefined' && typeof FaceDetection.verifyFace === 'function') {
            const hasFace = await FaceDetection.verifyFace(canvas);
            if (!hasFace) {
              return reject(new Error('⚠️ No detectamos ningún rostro en la foto seleccionada.\n\nPor favor, elegí una imagen donde se vea tu cara de frente con buena luz.'));
            }
          }

          // Compresión JPEG a 85% calidad con garantía de payload seguro
          let finalDataURL = canvas.toDataURL('image/jpeg', 0.85);
          if (typeof window.comprimirFoto === 'function') {
            try {
              finalDataURL = await window.comprimirFoto(finalDataURL, 1024, 0.85);
            } catch (e) {
              console.warn('[processUploadedImage] comprimirFoto fallback:', e);
            }
          }
          resolve(finalDataURL);
        } catch (err) {
          reject(err && err.message ? err : new Error('Error al procesar y redimensionar la imagen en el cliente.'));
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleGalleryUpload(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  input.value = ''; // Reset para poder re-seleccionar la misma imagen si fuera necesario

  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  if (!item) {
    alert('Primero elegí una gorra del catálogo.');
    return;
  }

  if (typeof puedeGenerar === 'function' && !puedeGenerar()) {
    const t = typeof tiempoRestante === 'function' ? tiempoRestante() : '';
    if (typeof mostrarLimiteAlcanzado === 'function') mostrarLimiteAlcanzado(t);
    return;
  }

  try {
    const compressedDataURL = await processUploadedImage(file);

    // Verify face presence in the uploaded photo
    const tempImg = new Image();
    await new Promise((resolve, reject) => {
      tempImg.onload = resolve;
      tempImg.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada.'));
      tempImg.src = compressedDataURL;
    });

    let faceFound = true;
    if (typeof FaceDetection !== 'undefined' && typeof FaceDetection.verifyFace === 'function') {
      faceFound = await FaceDetection.verifyFace(tempImg);
    }

    if (!faceFound) {
      showCustomModal({
        title: 'Rostro no detectado',
        message: 'La foto subida no contiene un rostro claro. Por favor, elegí una foto donde te veas de frente.',
        icon: 'face',
        buttonText: 'Elegir otra foto'
      });
      return;
    }

    // Detener cámara si estaba activa
    if (typeof FaceDetection !== 'undefined') {
      FaceDetection.stop();
    }
    if (typeof mediaStream !== 'undefined' && mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }

    const btnShoot = document.getElementById('btn-shoot');
    if (btnShoot) btnShoot.style.display = 'none';
    const btnAct = document.getElementById('btn-activate');
    if (btnAct) btnAct.style.display = 'inline-flex';

    resetResult();

    if (typeof registrarGeneracion === 'function') registrarGeneracion();
    if (typeof actualizarBadgeGeneraciones === 'function') actualizarBadgeGeneraciones();

    runVirtualTryOn(compressedDataURL, item.imgFrontal || item.imgPreview);
  } catch (err) {
    console.warn('[handleGalleryUpload]', err);
    showError(err.message || 'Error al procesar la imagen elegida.');
  }
}

// ── Control Visual de Cuota Mensual de IA por Tienda ──
function updateTryOnQuotaUI() {
  const quota = window.Store ? Store.getAiQuota() : null;
  const store = window.Store ? Store.getCurrentStore() : null;
  const quotaBanner = document.getElementById('tryon-store-quota-banner');
  const btnAct = document.getElementById('btn-activate');
  const btnShoot = document.getElementById('btn-shoot');
  const uploadInput = document.getElementById('tryon-gallery-input');

  if (!quota || !store) return;

  const isExhausted = quota.remaining <= 0;

  if (quotaBanner) {
    if (isExhausted) {
      quotaBanner.className = 'tryon-quota-badge exhausted';
      quotaBanner.innerHTML = `
        <div class="quota-badge-icon">⚠️</div>
        <div class="quota-badge-info">
          <strong>Límite mensual de ${quota.limit} pruebas con IA alcanzado</strong>
          <span>Tienda "${store.name}" (${store.subdomain}.capfit.store) · ${quota.used}/${quota.limit} usadas este mes (${quota.period}). El cupo se reinicia el 1° del próximo mes.</span>
        </div>
      `;
      quotaBanner.style.display = 'flex';

      // Desactivar botones de inicio
      if (btnAct) {
        btnAct.disabled = true;
        btnAct.title = 'Límite mensual de IA alcanzado para esta tienda';
        btnAct.style.opacity = '0.5';
        btnAct.style.cursor = 'not-allowed';
      }
      if (uploadInput) uploadInput.disabled = true;
    } else {
      quotaBanner.className = 'tryon-quota-badge normal';
      quotaBanner.innerHTML = `
        <div class="quota-badge-icon">⚡</div>
        <div class="quota-badge-info">
          <strong>Tienda: ${store.name}</strong> (${store.subdomain}.capfit.store) · 
          <span><strong>${quota.remaining}</strong> de ${quota.limit} pruebas IA disponibles este mes</span>
        </div>
        <span class="quota-badge-plan">${store.plan || 'Starter'}</span>
      `;
      quotaBanner.style.display = 'flex';

      if (btnAct) {
        btnAct.disabled = false;
        btnAct.title = '';
        btnAct.style.opacity = '1';
        btnAct.style.cursor = 'pointer';
      }
      if (uploadInput) uploadInput.disabled = false;
    }
  }
}

window.updateTryOnQuotaUI = updateTryOnQuotaUI;
if (window.Store && Store.on) {
  Store.on('store:synced', () => {
    updateTryOnQuotaUI();
  });
}
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(updateTryOnQuotaUI, 300);
});