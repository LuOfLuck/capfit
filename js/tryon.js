// ── Virtual Try-On ──
// Soporta dos motores: GPT-Image-2 y FASHN v1.6/v1.5
// Para cambiar el motor: editá CONFIG.aiModel en config.js

// ── UI helpers ──
function resetResult() {
  document.getElementById('result-img').style.display     = 'none';
  document.getElementById('error-box').style.display      = 'none';
  document.getElementById('loading-overlay').style.display = 'flex';
  setStep(1);
}

function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`ls-${i}`);
    el.classList.remove('active', 'done');
    if (i < n)        el.classList.add('done');
    else if (i === n) el.classList.add('active');
  }
}

function showError(msg) {
  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('error-msg').textContent = msg;
  document.getElementById('error-box').style.display = 'flex';
}

// Muestra la foto original sin editar como fallback
function showPhotoFallback(photoDataURL) {
  console.warn('[tryon] Mostrando foto original como fallback');
  const ri = document.getElementById('result-img');
  ri.src = photoDataURL;
  ri.onload = () => {
    document.getElementById('loading-overlay').style.display = 'none';
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
  const msg = gorraActiva
    ? `Hola! Vi la gorra *${gorraActiva.nombre}* en CAPFIT (${formatPrecio(gorraActiva.precio)}) y me encantó. ¡Quiero comprarla! 🧢`
    : CONFIG.whatsappMsg;
  document.getElementById('whatsapp-btn').href =
    'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ENTRADA PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runVirtualTryOn(photoDataURL, garmentImgPath) {
  console.log('[TRYON] ========== INICIO ==========');
  console.log('[TRYON] Motor activo:', CONFIG.aiModel);
  console.log('[TRYON] proxyBase:', CONFIG.proxyBase);
  console.log('[TRYON] garmentImgPath:', garmentImgPath);
  console.log('[TRYON] photoDataURL length:', photoDataURL?.length);

  try {
    setStep(1);
    console.log('[TRYON] Step 1: Cargando imagen de gorra...');
    
    let garmentDataURI;
    try {
      garmentDataURI = await cargarImagenComoDataURI(garmentImgPath);
      console.log('[TRYON] Gorra cargada OK, length:', garmentDataURI.length);
    } catch (e) {
      console.error('[TRYON] ERROR cargando gorra:', e);
      showPhotoFallback(photoDataURL);
      setWhatsAppLink();
      return;
    }

    console.log('[TRYON] Dispatching a motor:', CONFIG.aiModel);
    if (CONFIG.aiModel === 'gpt-image-2') {
      await runGPTImage2(photoDataURL, garmentDataURI);
    } else {
      await runFASHN(photoDataURL, garmentDataURI);
    }

    setWhatsAppLink();
    console.log('[TRYON] ========== FIN OK ==========');

  } catch (err) {
    console.error('[TRYON] ========== ERROR GENERAL ==========');
    console.error('[TRYON]', err);
    showPhotoFallback(photoDataURL);
    setWhatsAppLink();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MOTOR 1: GPT-Image-2 (openai/gpt-image-2/edit)
//  ~$0.015 por imagen en low quality
//  Acepta múltiples imágenes + prompt en texto
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── GPT-Image-2 con logs ──
async function runGPTImage2(photoDataURL, garmentDataURI) {
  const proxy = CONFIG.proxyBase;
  console.log('[GPT2] Iniciando, proxy:', proxy);

  setStep(2);
  
  const prompt = 'The first image is a person...'; // tu prompt actual
  console.log('[GPT2] Prompt length:', prompt.length);

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
    console.log('[GPT2] Response headers:', [...resp.headers.entries()]);

    setStep(3);

    if (!resp.ok) {
      const t = await resp.text();
      console.error('[GPT2] ERROR HTTP', resp.status, ':', t.slice(0, 500));
      throw new Error('GPT-Image-2 error (' + resp.status + '): ' + t);
    }

    const data = await resp.json();
    console.log('[GPT2] Response data keys:', Object.keys(data));
    console.log('[GPT2] Response data:', JSON.stringify(data).slice(0, 500));

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MOTOR 2: FASHN (v1.6 o v1.5)
//  ~$0.075 por imagen
//  Submit → poll status → fetch result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function runFASHN(photoDataURL, garmentDataURI) {
  const proxy = CONFIG.proxyBase;
  const model = CONFIG.aiModel === 'fashn-v1.5'
    ? 'fal-ai/fashn/tryon/v1.5'
    : 'fal-ai/fashn/tryon/v1.6';

  setStep(2);

  const submitResp = await fetch(proxy + '/api/fal/submit?model=' + encodeURIComponent(model), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_image:        photoDataURL,
      garment_image:      garmentDataURI,
      category:           'auto',
      mode:               'performance',
      garment_photo_type: 'flat-lay',
      nsfw_filter:        false,
    }),
  });

  if (!submitResp.ok) {
    const t = await submitResp.text();
    throw new Error('FASHN submit error (' + submitResp.status + '): ' + t);
  }

  const { request_id: requestId } = await submitResp.json();
  if (!requestId) throw new Error('FASHN: sin request_id.');
  console.log('[fashn] request_id:', requestId);

  setStep(3);

  // Poll status máx 120s
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));

    const stResp = await fetch(proxy + '/api/fal/status?reqId=' + requestId);
    if (!stResp.ok) { console.warn('[fashn] status', stResp.status); continue; }

    const st = await stResp.json();
    console.log('[fashn] status:', st.status);

    if (st.status === 'COMPLETED') {
      setStep(4);
      const resResp    = await fetch(proxy + '/api/fal/result?reqId=' + requestId);
      const resultData = await resResp.json();
      const imgURL =
        resultData?.images?.[0]?.url         ||
        resultData?.image?.url               ||
        resultData?.output?.images?.[0]?.url ||
        resultData?.output?.image?.url;

      if (!imgURL) throw new Error('FASHN: sin URL de imagen.');
      mostrarResultado(imgURL);
      return;
    }

    if (st.status === 'FAILED') {
      throw new Error('FASHN falló: ' + (st.error || JSON.stringify(st)));
    }
  }

  throw new Error('FASHN: tiempo de espera agotado (120s).');
}

// ── Mostrar imagen resultado ──
function mostrarResultado(imgURL) {
  const ri = document.getElementById('result-img');
  ri.onload  = () => {
    document.getElementById('loading-overlay').style.display = 'none';
    ri.style.display = 'block';
  };
  ri.onerror = () => {
    console.warn('[tryon] No se pudo cargar la imagen resultado, mostrando fallback');
    document.getElementById('loading-overlay').style.display = 'none';
    ri.style.display = 'block'; // igual mostramos aunque esté rota
  };
  ri.src = imgURL;
}