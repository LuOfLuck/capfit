// ── Virtual Try-On with Hugging Face Spaces ──
// Using backend proxy for IDM-VTON Space

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 2000;

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

// Esperar
async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Usar backend proxy para HF Spaces (IDM-VTON)
// garmentImgPath puede ser una ruta de archivo O una data URL
async function runVirtualTryOn(photoDataURL, garmentImgPath) {
  try {
    setStep(1);

    // Cargar imagen frontal de la gorra seleccionada como base64
    let garmentDataURI;
    try {
      // Si ya es una data URL, usarla directamente
      if (garmentImgPath.startsWith('data:')) {
        garmentDataURI = garmentImgPath;
      } else {
        // Si es una ruta, cargarla
        const r = await fetch(garmentImgPath);
        const blob = await r.blob();
        garmentDataURI = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onloadend = () => res(rd.result);
          rd.onerror = rej;
          rd.readAsDataURL(blob);
        });
      }
    } catch (e) {
      throw new Error(`No se encontró la imagen de la gorra: ${garmentImgPath}`);
    }

    setStep(2);

    // Llamar a nuestro backend proxy
    const backendURL = (CONFIG.proxyBase || '') + '/api/hf/tryon';
    let lastError = null;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`[HF] Intento ${attempt + 1}/${MAX_RETRIES} a ${backendURL}`);
        
        const submitResp = await fetch(backendURL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            person_image: photoDataURL,
            garment_image: garmentDataURI,
          }),
        });

        if (!submitResp.ok) {
          const t = await submitResp.text();
          console.error(`[HF] Status ${submitResp.status}:`, t.substring(0, 200));
          throw new Error(`HTTP ${submitResp.status}`);
        }

        const resultData = await submitResp.json();
        console.log('[HF] ✅ Respuesta exitosa');
        
        setStep(3);

        // Backend retorna: { image: url_o_data_url }
        let imgURL = resultData.image;
        if (!imgURL) {
          throw new Error('No se pudo obtener imagen del backend');
        }

        setStep(4);

        const ri = document.getElementById('result-img');
        if (ri) {
          ri.onload = () => { 
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) loadingOverlay.style.display = 'none'; 
            ri.style.display = 'block'; 
          };
          ri.onerror = () => showError('No se pudo cargar la imagen. Intentá de nuevo.');
          ri.src = imgURL;
        }

        // WhatsApp
        const whatsappBtn = document.getElementById('whatsapp-btn');
        if (whatsappBtn && typeof gorraActiva !== 'undefined' && gorraActiva && typeof formatPrecio === 'function') {
          const msg = `Hola! Vi la gorra *${gorraActiva.nombre}* en CAPFIT (${formatPrecio(gorraActiva.precio)}) y me encantó. ¡Quiero comprarla! 🧢`;
          whatsappBtn.href = 'https://wa.me/' + (typeof CONFIG !== 'undefined' && CONFIG.whatsapp ? CONFIG.whatsapp : '5491100000000') + '?text=' + encodeURIComponent(msg);
        }

        return; // ✅ Éxito
        
      } catch (err) {
        lastError = err;
        console.error(`[HF] ❌ Intento ${attempt + 1} falló:`, err.message);
        
        if (attempt < MAX_RETRIES - 1) {
          const delayMs = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          console.log(`[HF] ⏳ Esperando ${delayMs}ms...`);
          await wait(delayMs);
        }
      }
    }

    // Falló - mostrar mensaje amigable
    throw new Error(
      'El servicio de try-on (HF Spaces) no está disponible. ' +
      'Por favor intentá de nuevo en unos minutos o escribinos a WhatsApp! 🧢'
    );
        
  } catch (err) {
    console.error('❌ Try-On error:', err);
    showError(err.message || 'Error desconocido. Intentá de nuevo.');
  }
}
