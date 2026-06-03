// ── Virtual Try-On con múltiples backends ──
// Prioridad: 1) HF Inpaint (gratuito)  2) fal.ai  3) Replicate  4) Demo

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 2000;
const POLL_INTERVAL = 2000;
const MAX_POLL_TIME = 120000;

function resetResult() {
  const resultImg = document.getElementById('result-img');
  const errorBox = document.getElementById('error-box');
  const loadingOverlay = document.getElementById('loading-overlay');

  if (resultImg) resultImg.style.display = 'none';
  if (errorBox) errorBox.style.display = 'none';
  if (loadingOverlay) loadingOverlay.style.display = 'flex';

  setStep(1);
}

function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`ls-${i}`);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < n)        el.classList.add('done');
    else if (i === n) el.classList.add('active');
  }
}

function showError(msg) {
  const loadingOverlay = document.getElementById('loading-overlay');
  const errorBox = document.getElementById('error-box');
  const errorMsg = document.getElementById('error-msg');

  if (loadingOverlay) loadingOverlay.style.display = 'none';
  if (errorMsg) errorMsg.textContent = msg;
  if (errorBox) errorBox.style.display = 'flex';
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Cargar imagen de la gorra ──
async function cargarGarment(garmentImgPath) {
  if (!garmentImgPath) {
    if (typeof gorraActiva !== 'undefined' && gorraActiva && gorraActiva.imgFrontal) {
      garmentImgPath = gorraActiva.imgFrontal;
      console.log('[TryOn] Usando imgFrontal de gorraActiva:', garmentImgPath);
    } else {
      throw new Error('No hay gorra seleccionada. Elegí una del catálogo primero.');
    }
  }

  if (typeof garmentImgPath === 'string' && garmentImgPath.startsWith('data:')) {
    return garmentImgPath;
  }

  if (typeof garmentImgPath === 'string') {
    console.log('[TryOn] Cargando garment desde ruta:', garmentImgPath);
    const r = await fetch(garmentImgPath);
    if (!r.ok) {
      throw new Error(`No se pudo cargar la imagen de la gorra: ${r.status} ${r.statusText}`);
    }
    const blob = await r.blob();
    return await new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onloadend = () => res(rd.result);
      rd.onerror = () => rej(new Error('Error leyendo archivo de gorra'));
      rd.readAsDataURL(blob);
    });
  }

  throw new Error('Formato de imagen de gorra no válido');
}

// ── Generar máscara para inpainting (zona superior de la cabeza) ──
async function generarMascara(photoDataURL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;

      // Fondo negro (zona a preservar)
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Zona blanca en la parte superior (zona a rellenar con la gorra)
      // Cubrimos aproximadamente el 30% superior de la imagen
      // Centrado horizontalmente, cubriendo ~60% del ancho
      const maskHeight = Math.floor(canvas.height * 0.30);
      const maskWidth = Math.floor(canvas.width * 0.60);
      const maskX = Math.floor((canvas.width - maskWidth) / 2);
      const maskY = 0;

      ctx.fillStyle = 'white';
      ctx.fillRect(maskX, maskY, maskWidth, maskHeight);

      // Suavizar bordes con gradiente
      const gradient = ctx.createLinearGradient(0, maskHeight - 20, 0, maskHeight + 20);
      gradient.addColorStop(0, 'white');
      gradient.addColorStop(1, 'black');
      ctx.fillStyle = gradient;
      ctx.fillRect(maskX, maskHeight - 20, maskWidth, 40);

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = photoDataURL;
  });
}

// ── BACKEND 1: Hugging Face Inpainting (GRATUITO) ──
async function tryonHFInpaint(photoDataURL, garmentDataURI) {
  console.log('[TryOn] Intentando HF Inpainting (gratuito)...');

  const proxyBase = (CONFIG && CONFIG.proxyBase) ? CONFIG.proxyBase : '';
  const backendURL = proxyBase + '/api/hf/inpaint';

  // Generar máscara
  console.log('[TryOn] Generando máscara...');
  const maskData = await generarMascara(photoDataURL);

  // Detectar color de la gorra para el prompt
  let colorGorra = 'stylish';
  if (typeof gorraActiva !== 'undefined' && gorraActiva) {
    const nombre = gorraActiva.nombre.toLowerCase();
    if (nombre.includes('negro')) colorGorra = 'black';
    else if (nombre.includes('beige')) colorGorra = 'beige';
    else if (nombre.includes('navy') || nombre.includes('azul')) colorGorra = 'navy blue';
    else if (nombre.includes('premium')) colorGorra = 'premium stylish';
  }

  const prompt = `person wearing a ${colorGorra} baseball cap on their head, realistic photo, high quality, natural lighting`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 1 minuto

  try {
    const resp = await fetch(backendURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_image: photoDataURL,
        garment_image: garmentDataURI,
        prompt: prompt,
        mask_data: maskData,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const t = await resp.text();
      console.error('[TryOn] HF Inpaint error:', resp.status, t.substring(0, 500));
      throw new Error(`HF Inpaint error: HTTP ${resp.status}`);
    }

    const result = await resp.json();
    console.log('[TryOn] HF Inpaint result:', result);

    if (result.image) {
      return result.image;
    }

    throw new Error('No se encontró imagen en la respuesta');

  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── BACKEND 2: fal.ai ──
async function tryonFal(photoDataURL, garmentDataURI) {
  const proxyBase = (CONFIG && CONFIG.proxyBase) ? CONFIG.proxyBase : '';
  const falModel = (CONFIG && CONFIG.falModel) ? CONFIG.falModel : 'fal-ai/fashn/tryon/v1.5';

  console.log('[TryOn] Intentando fal.ai...');
  const submitURL = proxyBase + '/api/fal/submit?model=' + encodeURIComponent(falModel);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const submitResp = await fetch(submitURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_image: photoDataURL,
      garment_image: garmentDataURI,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!submitResp.ok) {
    const t = await submitResp.text();
    console.error('[TryOn] fal.ai submit error:', submitResp.status, t.substring(0, 500));

    if (submitResp.status === 403) {
      try {
        const errData = JSON.parse(t);
        if (errData.detail && errData.detail.includes('Exhausted balance')) {
          throw new Error('FAL_NO_CREDITS');
        }
      } catch (e) {
        if (e.message === 'FAL_NO_CREDITS') throw e;
      }
    }
    throw new Error(`fal.ai error: HTTP ${submitResp.status}`);
  }

  const submitData = await submitResp.json();
  console.log('[TryOn] fal.ai submit response:', submitData);

  const requestId = submitData.request_id;
  if (!requestId) {
    if (submitData.images && submitData.images.length > 0) {
      return submitData.images[0].url;
    }
    throw new Error('No se obtuvo request_id del submit');
  }

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIME) {
    await wait(POLL_INTERVAL);

    const statusURL = proxyBase + '/api/fal/status?model=' + encodeURIComponent(falModel) + '&reqId=' + encodeURIComponent(requestId);
    const statusResp = await fetch(statusURL);

    if (!statusResp.ok) continue;

    const statusData = await statusResp.json();
    console.log('[TryOn] fal.ai status:', statusData.status);

    if (statusData.status === 'COMPLETED') {
      const resultURL = proxyBase + '/api/fal/result?model=' + encodeURIComponent(falModel) + '&reqId=' + encodeURIComponent(requestId);
      const resultResp = await fetch(resultURL);

      if (!resultResp.ok) {
        throw new Error('Error obteniendo resultado: HTTP ' + resultResp.status);
      }

      const resultData = await resultResp.json();
      if (resultData.images && resultData.images.length > 0) {
        return resultData.images[0].url;
      } else if (resultData.image) {
        return resultData.image;
      }
      throw new Error('No se encontró imagen en el resultado');
    }

    if (statusData.status === 'FAILED') {
      throw new Error('El procesamiento falló: ' + (statusData.error || 'Error desconocido'));
    }
  }

  throw new Error('Timeout esperando resultado de fal.ai');
}

// ── BACKEND 3: Replicate ──
async function tryonReplicate(photoDataURL, garmentDataURI) {
  console.log('[TryOn] Intentando Replicate...');

  const proxyBase = (CONFIG && CONFIG.proxyBase) ? CONFIG.proxyBase : '';
  const backendURL = proxyBase + '/api/replicate/tryon';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  try {
    const resp = await fetch(backendURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_image: photoDataURL,
        garment_image: garmentDataURI,
        garment_des: 'cap',
        category: 'upper_body',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const t = await resp.text();
      console.error('[TryOn] Replicate error:', resp.status, t.substring(0, 500));
      throw new Error(`Replicate error: HTTP ${resp.status}`);
    }

    const result = await resp.json();
    console.log('[TryOn] Replicate result:', result);

    if (result.image) {
      if (Array.isArray(result.image) && result.image.length > 0) {
        return result.image[0];
      }
      return result.image;
    }

    throw new Error('No se encontró imagen en la respuesta de Replicate');

  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── BACKEND 4: Modo Demo ──
async function tryonDemo(photoDataURL, garmentDataURI) {
  console.log('[TryOn] Usando modo demo...');
  await wait(3000);
  return photoDataURL;
}

// ── FUNCIÓN PRINCIPAL ──
async function runVirtualTryOn(photoDataURL, garmentImgPath) {
  try {
    setStep(1);

    if (!photoDataURL) {
      throw new Error('No se proporcionó foto del usuario');
    }

    if (typeof CONFIG === 'undefined') {
      throw new Error('Error de configuración: CONFIG no encontrado');
    }

    const garmentDataURI = await cargarGarment(garmentImgPath);
    setStep(2);

    let imgURL = null;
    let lastError = null;

    // 1. Intentar HF Inpainting (gratuito)
    try {
      imgURL = await tryonHFInpaint(photoDataURL, garmentDataURI);
      console.log('[TryOn] ✅ HF Inpaint funcionó');
    } catch (err) {
      lastError = err;
      console.warn('[TryOn] HF Inpaint falló:', err.message);
    }

    // 2. Si HF falló, intentar fal.ai
    if (!imgURL) {
      try {
        imgURL = await tryonFal(photoDataURL, garmentDataURI);
        console.log('[TryOn] ✅ fal.ai funcionó');
      } catch (err) {
        lastError = err;
        console.warn('[TryOn] fal.ai falló:', err.message);
      }
    }

    // 3. Si fal.ai falló, intentar Replicate
    if (!imgURL) {
      try {
        imgURL = await tryonReplicate(photoDataURL, garmentDataURI);
        console.log('[TryOn] ✅ Replicate funcionó');
      } catch (err) {
        lastError = err;
        console.warn('[TryOn] Replicate falló:', err.message);
      }
    }

    // 4. Si todo falló, modo demo
    if (!imgURL) {
      console.warn('[TryOn] Todos los backends fallaron, usando modo demo');
      imgURL = await tryonDemo(photoDataURL, garmentDataURI);

      const demoWarning = document.createElement('div');
      demoWarning.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#f59e0b;color:white;padding:10px 20px;border-radius:8px;z-index:9999;font-size:0.85rem;max-width:90%;text-align:center;';
      demoWarning.innerHTML = '⚠️ Modo demo activo — Agregá HF_TOKEN al .env para resultados reales (gratis 300 req/hr)';
      document.body.appendChild(demoWarning);
      setTimeout(() => demoWarning.remove(), 8000);
    }

    await mostrarResultado(imgURL);

  } catch (err) {
    console.error('❌ Try-On error:', err);
    showError(err.message || 'Error desconocido. Intentá de nuevo.');
  }
}

// Mostrar resultado y configurar WhatsApp
async function mostrarResultado(imgURL) {
  setStep(4);

  const ri = document.getElementById('result-img');
  if (ri) {
    ri.onload = () => { 
      const loadingOverlay = document.getElementById('loading-overlay');
      if (loadingOverlay) loadingOverlay.style.display = 'none'; 
      ri.style.display = 'block'; 
      console.log('[TryOn] ✅ Imagen mostrada correctamente');
    };
    ri.onerror = () => {
      console.error('[TryOn] ❌ Error cargando imagen resultante');
      showError('No se pudo cargar la imagen generada. Intentá de nuevo.');
    };
    ri.src = imgURL;
  }

  const resultCapImg = document.getElementById('result-cap-img');
  const resultCapNombre = document.getElementById('result-cap-nombre');
  const resultCapPrecio = document.getElementById('result-cap-precio');

  if (typeof gorraActiva !== 'undefined' && gorraActiva) {
    if (resultCapImg) resultCapImg.src = gorraActiva.imgPreview || '';
    if (resultCapNombre) resultCapNombre.textContent = gorraActiva.nombre || '—';
    if (resultCapPrecio && typeof formatPrecio === 'function') {
      resultCapPrecio.textContent = formatPrecio(gorraActiva.precio);
    }
  }

  const whatsappBtn = document.getElementById('whatsapp-btn');
  if (whatsappBtn && typeof gorraActiva !== 'undefined' && gorraActiva && typeof formatPrecio === 'function') {
    const msg = `Hola! Vi la gorra *${gorraActiva.nombre}* en CAPFIT (${formatPrecio(gorraActiva.precio)}) y me encantó. ¡Quiero comprarla! 🧢`;
    const whatsappNumber = (CONFIG && CONFIG.whatsapp) ? CONFIG.whatsapp : '5491100000000';
    whatsappBtn.href = 'https://wa.me/' + whatsappNumber + '?text=' + encodeURIComponent(msg);
    console.log('[TryOn] WhatsApp link actualizado');
  }
}