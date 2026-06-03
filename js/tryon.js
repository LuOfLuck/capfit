// ── fal.ai FASHN Virtual Try-On ──
// La API key vive en el servidor (variable de entorno), nunca en el browser.

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

// garmentImgPath = ruta local de la imagen FRONTAL de la gorra seleccionada
async function runVirtualTryOn(photoDataURL, garmentImgPath) {
  try {
    setStep(1);

    const proxy = CONFIG.proxyBase;
    const model = CONFIG.falModel;

    // Cargar imagen frontal de la gorra seleccionada como data URI
    let garmentDataURI;
    try {
      const r    = await fetch(garmentImgPath);
      const blob = await r.blob();
      garmentDataURI = await new Promise((res, rej) => {
        const rd = new FileReader();
        rd.onloadend = () => res(rd.result);
        rd.onerror   = rej;
        rd.readAsDataURL(blob);
      });
    } catch (e) {
      throw new Error(`No se encontró la imagen de la gorra: ${garmentImgPath}`);
    }

    setStep(2);

    const submitResp = await fetch(proxy + '/api/fal/submit?model=' + encodeURIComponent(model), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_image:        photoDataURL,
        garment_image:      garmentDataURI,
        category:           'auto',
        mode:               'balanced',
        garment_photo_type: 'flat-lay',
        nsfw_filter:        false,
      }),
    });

    if (!submitResp.ok) {
      const t = await submitResp.text();
      throw new Error('Error al enviar (' + submitResp.status + '): ' + t);
    }

    const { request_id: requestId } = await submitResp.json();
    if (!requestId) throw new Error('Sin request_id de fal.ai. Intentá de nuevo.');
    console.log('[fal] request_id:', requestId);

    setStep(3);

    // Poll status (máx 120s)
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));

      const stResp = await fetch(proxy + '/api/fal/status?reqId=' + requestId);
      if (!stResp.ok) { console.warn('[fal] status', stResp.status); continue; }

      const st = await stResp.json();
      console.log('[fal] status:', st.status);

      if (st.status === 'COMPLETED') {
        setStep(4);

        const resResp    = await fetch(proxy + '/api/fal/result?reqId=' + requestId);
        const resultData = await resResp.json();

        const imgURL =
          resultData?.images?.[0]?.url         ||
          resultData?.image?.url               ||
          resultData?.output?.images?.[0]?.url ||
          resultData?.output?.image?.url;

        if (!imgURL) throw new Error('Sin URL de imagen: ' + JSON.stringify(resultData));

        const ri = document.getElementById('result-img');
        ri.onload  = () => { document.getElementById('loading-overlay').style.display = 'none'; ri.style.display = 'block'; };
        ri.onerror = () => showError('No se pudo cargar la imagen. Intentá de nuevo.');
        ri.src = imgURL;

        // WhatsApp con nombre y precio de la gorra elegida
        const msg = gorraActiva
          ? `Hola! Vi la gorra *${gorraActiva.nombre}* en CAPFIT (${formatPrecio(gorraActiva.precio)}) y me encantó. ¡Quiero comprarla! 🧢`
          : CONFIG.whatsappMsg;
        document.getElementById('whatsapp-btn').href =
          'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(msg);
        return;
      }

      if (st.status === 'FAILED') {
        throw new Error('El modelo falló: ' + (st.error || JSON.stringify(st)));
      }
    }

    throw new Error('Tiempo de espera agotado (120s). Intentá de nuevo.');

  } catch (err) {
    console.error('VTryOn error:', err);
    showError(err.message || 'Error desconocido.');
  }
}