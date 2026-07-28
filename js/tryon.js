
let tryOnProgressInterval = null;

function startTryOnProgress() {
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
  const msg = item
    ? `Hola! Vi *${item.nombre}* en CAPFIT (${formatPrecio(item.precio)}) y me encantó. ¡Quiero comprarlo!`
    : CONFIG.whatsappMsg;
  const waBtn = document.getElementById('whatsapp-btn');
  if (waBtn) {
    waBtn.href = 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg);
  }
}

const PROMPTS_POR_TIPO = {
  gorra:
    'Devolve una foto de la persona con la gorra puesta',

  anteojo:
    'Devolve una foto de la persona con los anteojos puestos',

  default:
    'Devolve una foto de la persona con eso puesto',
};

function getPromptParaTipo(tipo) {
  return PROMPTS_POR_TIPO[tipo] || PROMPTS_POR_TIPO.default;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ENTRADA PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runVirtualTryOn(photoDataURL, garmentImgPath) {
  // Item activo (gorra, anteojo, etc.) — lo usamos para saber qué prompt usar
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  const tipo = item?.tipo || 'gorra'; // default a 'gorra' por compatibilidad con items viejos sin "tipo"

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
      showPhotoFallback(photoDataURL);
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
    showPhotoFallback(photoDataURL);
    setWhatsAppLink();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runGPTImage2(photoDataURL, garmentDataURI, tipo) {
  const proxy = CONFIG.proxyBase;
  console.log('[GPT2] Iniciando, proxy:', proxy);

  setStep(2);

  const prompt = getPromptParaTipo(tipo);
  console.log('[GPT2] Tipo:', tipo, '| Prompt length:', prompt.length);

  const payload = {
    prompt,
    image_urls: [photoDataURL, garmentDataURI],
    quality: 'low',
    image_size: 'square',
    output_format: 'jpeg',
  };
  console.log('[GPT2] Payload image_urls lengths:',
    payload.image_urls[0]?.length,
    payload.image_urls[1]?.length
  );

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
    console.log('[GPT2] Response data keys:', Object.keys(data));

    const imgURL = data?.images?.[0]?.url || data?.data?.[0]?.url;
    console.log('[GPT2] imgURL encontrada:', imgURL ? 'SÍ' : 'NO');

    if (!imgURL) {
      console.error('[GPT2] No imgURL en respuesta. Estructura:', data);
      throw new Error('GPT-Image-2 no devolvió imagen');
    }

    setStep(4);
    mostrarResultado(imgURL);
    console.log('[GPT2] Resultado mostrado');

  } catch (e) {
    console.error('[GPT2] ERROR en fetch:', e);
    throw e;
  }
}


// ── Mostrar imagen resultado ──
function mostrarResultado(imgURL) {
  finishTryOnProgress();
  const ri = document.getElementById('result-img');
  if (!ri) return;
  ri.onload  = () => {
    setTimeout(() => {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.style.display = 'none';
      ri.style.display = 'block';
    }, 400);
  };
  ri.onerror = () => {
    console.warn('[tryon] No se pudo cargar la imagen resultado, mostrando fallback');
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
    ri.style.display = 'block';
  };
  ri.src = imgURL;
}