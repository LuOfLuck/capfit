
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

function startTryOnProgress() {
  setTryOnProcessingState(true);
  document.getElementById('loading-overlay').style.display = 'flex';
  const fill = document.getElementById('tryon-progress-fill');
  const pct = document.getElementById('tryon-progress-pct');
  const stepIds = ['chk-step-1', 'chk-step-2', 'chk-step-3', 'chk-step-4', 'chk-step-5'];

  if (tryOnProgressInterval) clearInterval(tryOnProgressInterval);

  let currentPct = 0;
  if (fill) fill.style.width = '0%';
  if (pct) pct.textContent = '0%';

  function updateStepState(stepIndex) {
    stepIds.forEach((id, idx) => {
      const el = document.getElementById(id);
      if (!el) return;
      const iconSpan = el.querySelector('.chk-icon');
      if (idx < stepIndex) {
        el.className = 'tryon-check-item done';
        if (iconSpan) iconSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
      } else if (idx === stepIndex) {
        el.className = 'tryon-check-item active';
        if (iconSpan) iconSpan.innerHTML = `<span class="spin-dot"></span>`;
      } else {
        el.className = 'tryon-check-item';
        if (iconSpan) iconSpan.innerHTML = `<span class="empty-circle"></span>`;
      }
    });
  }

  updateStepState(0);

  tryOnProgressInterval = setInterval(() => {
    if (currentPct < 92) {
      currentPct += Math.floor(Math.random() * 4) + 2;
      if (currentPct > 92) currentPct = 92;
      if (fill) fill.style.width = currentPct + '%';
      if (pct) pct.textContent = currentPct + '%';

      let stepIdx = 0;
      if (currentPct >= 75) stepIdx = 3;
      else if (currentPct >= 50) stepIdx = 2;
      else if (currentPct >= 25) stepIdx = 1;
      
      updateStepState(stepIdx);
    }
  }, 220);
}

function finishTryOnProgress() {
  if (tryOnProgressInterval) clearInterval(tryOnProgressInterval);
  const fill = document.getElementById('tryon-progress-fill');
  const pct = document.getElementById('tryon-progress-pct');
  const stepIds = ['chk-step-1', 'chk-step-2', 'chk-step-3', 'chk-step-4', 'chk-step-5'];

  if (fill) fill.style.width = '100%';
  if (pct) pct.textContent = '100%';

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

function setStep(n) {
  const stepIds = ['chk-step-1', 'chk-step-2', 'chk-step-3', 'chk-step-4', 'chk-step-5'];
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

function showError(msg) {
  setTryOnProcessingState(false);
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';
  const errorMsg = document.getElementById('error-msg');
  if (errorMsg) errorMsg.textContent = msg;
  const errorBox = document.getElementById('error-box');
  if (errorBox) errorBox.style.display = 'flex';
}

// Muestra la foto original sin editar como fallback
function showPhotoFallback(photoDataURL) {
  console.warn('[tryon] Mostrando foto original como fallback');
  setTryOnProcessingState(false);
  const ri = document.getElementById('result-img');
  if (!ri) return;
  ri.src = photoDataURL;
  ri.onload = () => {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
    ri.style.display = 'block';
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
  gorra: 'A realistic photograph of the person naturally wearing the baseball cap, high quality, accurate fitting on head, clean lighting',
  anteojo: 'A realistic photograph of the person naturally wearing the sunglasses, high quality, clean lighting',
  default: 'A realistic photograph of the person naturally wearing the item, high quality, clean lighting',
};

function getPromptParaTipo(tipo) {
  return PROMPTS_POR_TIPO[tipo] || PROMPTS_POR_TIPO.default;
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
async function runVirtualTryOn(photoDataURL, garmentImgPath) {
  window.lastUserPhoto = photoDataURL;
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  const tipo = item?.tipo || 'gorra';

  console.log('[TRYON] ========== INICIO ==========');
  console.log('[TRYON] Motor activo:', CONFIG.aiModel);
  console.log('[TRYON] Tipo de producto:', tipo);
  console.log('[TRYON] proxyBase:', CONFIG.proxyBase);
  console.log('[TRYON] garmentImgPath:', garmentImgPath);

  startTryOnProgress();

  try {
    setStep(1);
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
    if (CONFIG.aiModel === 'gpt-image-2') {
      await runGPTImage2(photoDataURL, garmentDataURI, tipo);
    } else {
      await runFASHN(photoDataURL, garmentDataURI);
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
//  GPT-IMAGE-2 (fal.ai / openai / gpt-image-2 / edit)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runGPTImage2(photoDataURL, garmentDataURI, tipo) {
  const proxy = CONFIG.proxyBase;
  console.log('[GPT2] Iniciando, proxy:', proxy);

  setStep(2);

  const prompt = getPromptParaTipo(tipo);
  console.log('[GPT2] Tipo:', tipo, '| Prompt:', prompt);

  const payload = {
    prompt,
    image_urls: [photoDataURL, garmentDataURI],
    quality: 'low',
    image_size: 'square',
    output_format: 'jpeg',
  };

  const url = proxy + '/api/gpt/edit';
  console.log('[GPT2] Fetching:', url);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log('[GPT2] Response status:', resp.status);

    setStep(3);

    if (!resp.ok) {
      const t = await resp.text();
      console.error('[GPT2] ERROR HTTP', resp.status, ':', t.slice(0, 500));
      throw new Error('GPT-Image-2 error (' + resp.status + '): ' + t);
    }

    const data = await resp.json();
    console.log('[GPT2] Response data:', data);

    const imgURL = extractImageUrl(data);
    console.log('[GPT2] imgURL encontrada:', imgURL ? 'SÍ (' + imgURL.slice(0, 60) + '...)' : 'NO');

    if (!imgURL) {
      console.error('[GPT2] No imgURL en respuesta. Estructura:', data);
      throw new Error('GPT-Image-2 no devolvió URL de imagen válida');
    }

    setStep(4);
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
async function runFASHN(photoDataURL, garmentDataURI) {
  const proxy = CONFIG.proxyBase;
  const model = CONFIG.aiModel === 'fashn-v1.6'
    ? 'fal-ai/fashn/tryon/v1.6'
    : 'fal-ai/fashn/tryon/v1.5';

  console.log('[FASHN] Iniciando try-on con modelo:', model);
  setStep(2);

  const payload = {
    model_image: photoDataURL,
    garment_image: garmentDataURI,
    category: 'tops',
  };

  const submitUrl = `${proxy}/api/fal/submit?model=${encodeURIComponent(model)}`;
  const submitResp = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!submitResp.ok) {
    const errTxt = await submitResp.text();
    throw new Error(`Error FASHN submit (${submitResp.status}): ${errTxt}`);
  }

  const submitData = await submitResp.json();
  const reqId = submitData.request_id;
  if (!reqId) {
    const directUrl = extractImageUrl(submitData);
    if (directUrl) {
      setStep(4);
      mostrarResultado(directUrl);
      return;
    }
    throw new Error('FASHN no devolvió request_id');
  }

  setStep(3);
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
      if (status === 'FAILED') {
        throw new Error('Procesamiento FASHN falló en el servidor');
      }
    }
  }

  if (status !== 'COMPLETED') {
    throw new Error('Tiempo de espera agotado al procesar FASHN');
  }

  const resultUrl = `${proxy}/api/fal/result?model=${encodeURIComponent(model)}&reqId=${encodeURIComponent(reqId)}`;
  const resultResp = await fetch(resultUrl);
  if (!resultResp.ok) {
    throw new Error(`Error obteniendo resultado FASHN (${resultResp.status})`);
  }

  const resultData = await resultResp.json();
  const imgURL = extractImageUrl(resultData);
  if (!imgURL) {
    throw new Error('No se encontró URL de imagen en el resultado de FASHN');
  }

  setStep(4);
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
      ctx.fillText(`${capName} · capfit.luofluck.tech`, padding, bannerY + bannerHeight * 0.72);

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

          // Compresión JPEG a 85% calidad
          const compressedDataURL = canvas.toDataURL('image/jpeg', 0.85);
          resolve(compressedDataURL);
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