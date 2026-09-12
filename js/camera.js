// ── Cámara, captura y límite de generaciones ──

const MAX_GENERACIONES = 5;
const RESET_MS = 2 * 60 * 60 * 1000; // 2 horas
const LS_KEY = 'capfit_gen';

function getLimite() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { count: 0, firstAt: null };
    return JSON.parse(raw);
  } catch { return { count: 0, firstAt: null }; }
}

function guardarLimite(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function verificarYRestablecerSiPaso(data) {
  if (!data.firstAt) return data;
  const ahora = Date.now();
  if (ahora - data.firstAt >= RESET_MS) {
    const nuevo = { count: 0, firstAt: null };
    guardarLimite(nuevo);
    return nuevo;
  }
  return data;
}

function puedeGenerar() {
  let data = getLimite();
  data = verificarYRestablecerSiPaso(data);
  return data.count < MAX_GENERACIONES;
}

function registrarGeneracion() {
  let data = getLimite();
  data = verificarYRestablecerSiPaso(data);
  if (!data.firstAt) data.firstAt = Date.now();
  data.count = (data.count || 0) + 1;
  guardarLimite(data);
}

function tiempoRestante() {
  const data = getLimite();
  if (!data.firstAt) return '';
  const ms = RESET_MS - (Date.now() - data.firstAt);
  if (ms <= 0) return '';
  const min = Math.ceil(ms / 60000);
  if (min >= 60) {
    const h = Math.floor(min / 60), m = min % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${min} min`;
}

function generacionesRestantes() {
  let data = getLimite();
  data = verificarYRestablecerSiPaso(data);
  return Math.max(0, MAX_GENERACIONES - data.count);
}

function actualizarBadgeGeneraciones() {
  const badge = document.getElementById('gen-badge');
  if (!badge) return;
  const restantes = generacionesRestantes();
  if (restantes === 0) {
    const t = tiempoRestante();
    badge.textContent = `Sin usos restantes${t ? ' · Reinicia en ' + t : ''}`;
  } else {
    badge.textContent = `${restantes} de ${MAX_GENERACIONES} usos restantes`;
  }
}

// ── Cámara ──
let mediaStream = null;
let currentFacingMode = 'user'; // 'user' (frontal) | 'environment' (trasera)
let cameraGuideEnabled = true;
let countdownInterval = null;

async function activateCamera() {
  try {
    cancelCountdown();

    if (typeof FaceDetection !== 'undefined') {
      FaceDetection.stop();
    }

    const v = document.getElementById('video-feed');
    if (v) {
      v.pause();
      v.srcObject = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }

    // Hide previous generated image, result actions and error box
    const resImg = document.getElementById('result-img');
    if (resImg) {
      resImg.style.display = 'none';
      resImg.src = '';
    }

    const resActions = document.getElementById('tryon-result-actions');
    if (resActions) resActions.style.display = 'none';

    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';

    const errBox = document.getElementById('error-box');
    if (errBox) errBox.style.display = 'none';

    // High resolution video constraints with fallback chain for rear/front cameras
    const isFront = (currentFacingMode === 'user');
    const constraintList = [
      { video: { facingMode: isFront ? 'user' : { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } } },
      { video: { facingMode: isFront ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 960 } } },
      { video: { facingMode: isFront ? 'user' : 'environment' } },
      { video: true }
    ];

    let newStream = null;
    for (const constraints of constraintList) {
      try {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (newStream) break;
      } catch (err) {
        console.warn('[Camera] Constraint failed, trying next fallback:', err);
      }
    }

    if (!newStream) {
      throw new Error('No se pudo acceder al flujo de video de la cámara.');
    }

    mediaStream = newStream;

    if (!v) return;
    v.srcObject = mediaStream;
    v.style.display = 'block';

    // Mirror feed horizontally ONLY if using front camera ('user')
    v.style.transform = isFront ? 'scaleX(-1)' : 'scaleX(1)';

    try {
      await v.play();
    } catch (playErr) {
      console.warn('[Camera] v.play() catch:', playErr);
    }

    const ph = document.getElementById('cam-placeholder');
    if (ph) ph.style.display = 'none';

    const btnAct = document.getElementById('btn-activate');
    if (btnAct) btnAct.style.display = 'none';

    const btnShoot = document.getElementById('btn-shoot');
    if (btnShoot) btnShoot.style.display = 'inline-flex';

    // Show floating live camera tools & pose guide overlay
    const liveTools = document.getElementById('cam-live-tools');
    if (liveTools) liveTools.style.display = 'flex';

    const guideOverlay = document.getElementById('camera-guide-overlay');
    if (guideOverlay) guideOverlay.style.display = cameraGuideEnabled ? 'flex' : 'none';

    // Update switch button label
    const switchLabel = document.getElementById('cam-live-switch-label');
    if (switchLabel) {
      switchLabel.textContent = isFront ? 'Cámara trasera' : 'Cámara frontal';
    }

    if (typeof FaceDetection !== 'undefined') {
      FaceDetection.start(v);
    }
  } catch (e) {
    console.warn('[Camera] No camera permission or stream failed:', e);
    alert('No se pudo acceder a la cámara. Verificá los permisos de tu navegador.');
  }
}

async function switchCamera() {
  cancelCountdown();
  currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
  console.log('[Camera] Cambiando modo a:', currentFacingMode);
  await activateCamera();
}

function toggleCameraGuide() {
  cameraGuideEnabled = !cameraGuideEnabled;
  const guideOverlay = document.getElementById('camera-guide-overlay');
  const btnGuide = document.getElementById('btn-toggle-guide');
  if (guideOverlay) {
    guideOverlay.style.display = (cameraGuideEnabled && mediaStream) ? 'flex' : 'none';
  }
  if (btnGuide) {
    if (cameraGuideEnabled) btnGuide.classList.add('active');
    else btnGuide.classList.remove('active');
  }
}

function takePhoto() {
  startCountdownAndSnap();
}

async function startCountdownAndSnap() {
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  if (!item) {
    alert('Primero elegí una gorra del catálogo.');
    return;
  }

  if (!puedeGenerar()) {
    const t = tiempoRestante();
    mostrarLimiteAlcanzado(t);
    return;
  }

  // Pre-check face detection before starting countdown
  const video = document.getElementById('video-feed');
  let faceFound = false;

  if (typeof FaceDetection !== 'undefined') {
    if (FaceDetection.isActive() && FaceDetection.hasFace()) {
      faceFound = true;
    } else if (video && video.readyState >= 2) {
      faceFound = await FaceDetection.verifyFace(video);
    }
  } else {
    faceFound = true;
  }

  if (!faceFound) {
    showCustomModal({
      title: 'No detectamos tu rostro',
      message: 'Por favor, ubicate bien de frente a la cámara dentro de la guía antes de tomar la foto.',
      icon: 'face',
      buttonText: 'Aceptar'
    });
    return;
  }

  const overlay = document.getElementById('countdown-overlay');
  const numEl = document.getElementById('countdown-number');
  const labelEl = document.getElementById('countdown-label');

  if (!overlay || !numEl) {
    executeTakePhoto();
    return;
  }

  cancelCountdown();

  overlay.style.display = 'flex';
  let count = 3;
  numEl.textContent = count;
  if (labelEl) labelEl.textContent = '¡Acomodate frente a la cámara!';

  countdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
      numEl.classList.remove('pulse-anim');
      void numEl.offsetWidth; // force CSS reflow for pulse animation
      numEl.classList.add('pulse-anim');
    } else if (count === 0) {
      numEl.textContent = '¡Sonreí!';
      if (labelEl) labelEl.textContent = 'Capturando...';
    } else {
      cancelCountdown();
      executeTakePhoto();
    }
  }, 900);
}

function cancelCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  const overlay = document.getElementById('countdown-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function executeTakePhoto() {
  cancelCountdown();

  const video = document.getElementById('video-feed');
  const canvas = document.getElementById('photo-canvas');
  if (!video || !canvas) return;

  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;

  const maxW = (CONFIG.aiModel && CONFIG.aiModel.startsWith('gpt-image')) ? 512 : 768;
  const videoW = video.videoWidth || 640;
  const videoH = video.videoHeight || 480;

  // 3:4 Vertical portrait frame
  const targetRatio = 4 / 3;
  const canvasW = Math.min(videoW, maxW);
  const canvasH = Math.round(canvasW * targetRatio);
  canvas.width = canvasW;
  canvas.height = canvasH;

  const videoAspect = videoW / videoH;
  const targetAspect = canvasW / canvasH;

  let sx = 0, sy = 0, sWidth = videoW, sHeight = videoH;
  if (videoAspect > targetAspect) {
    sWidth = videoH * targetAspect;
    sx = (videoW - sWidth) / 2;
  } else {
    sHeight = videoW / targetAspect;
    sy = (videoH - sHeight) / 2;
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  if (currentFacingMode === 'user') {
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, -canvasW, 0, canvasW, canvasH);
  } else {
    ctx.scale(1, 1);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvasW, canvasH);
  }
  ctx.restore();

  // Check face detection before processing
  let faceFound = true;
  if (typeof FaceDetection !== 'undefined' && typeof FaceDetection.verifyFace === 'function') {
    faceFound = await FaceDetection.verifyFace(canvas);
  }

  if (!faceFound) {
    showCustomModal({
      title: 'Rostro no detectado',
      message: 'Por favor, ubicate bien de frente a la cámara con buena iluminación e intentá de nuevo.',
      icon: 'face',
      buttonText: 'Intentar de nuevo'
    });

    const liveTools = document.getElementById('cam-live-tools');
    if (liveTools) liveTools.style.display = 'flex';

    const guideOverlay = document.getElementById('camera-guide-overlay');
    if (guideOverlay) guideOverlay.style.display = cameraGuideEnabled ? 'flex' : 'none';

    if (typeof FaceDetection !== 'undefined') {
      FaceDetection.start(video);
    }
    return;
  }

  if (typeof FaceDetection !== 'undefined') {
    FaceDetection.stop();
  }

  // Hide live overlays when photo is valid
  const guideOverlay = document.getElementById('camera-guide-overlay');
  if (guideOverlay) guideOverlay.style.display = 'none';

  const liveTools = document.getElementById('cam-live-tools');
  if (liveTools) liveTools.style.display = 'none';

  const quality = (CONFIG.aiModel && CONFIG.aiModel.startsWith('gpt-image')) ? 0.75 : 0.80;
  const dataURL = canvas.toDataURL('image/jpeg', quality);

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  video.style.display = 'none';

  registrarGeneracion();
  actualizarBadgeGeneraciones();

  const btnShoot = document.getElementById('btn-shoot');
  if (btnShoot) btnShoot.style.display = 'none';

  const btnAct = document.getElementById('btn-activate');
  if (btnAct) btnAct.style.display = 'inline-flex';

  resetResult();
  runVirtualTryOn(dataURL, item.imgFrontal || item.imgPreview);
}

function mostrarLimiteAlcanzado(tiempoStr) {
  cancelCountdown();

  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';

  const resImg = document.getElementById('result-img');
  if (resImg) resImg.style.display = 'none';

  const eb = document.getElementById('error-box');
  const em = document.getElementById('error-msg');
  if (em) {
    em.innerHTML = `Alcanzaste el límite de ${MAX_GENERACIONES} pruebas gratuitas.<br>` +
      (tiempoStr ? `Podés volver a intentarlo en <strong>${tiempoStr}</strong>.` : 'Volvé pronto.');
  }
  if (eb) eb.style.display = 'flex';
}

function retryPhoto() {
  cancelCountdown();

  if (typeof setTryOnProcessingState === 'function') {
    setTryOnProcessingState(false);
  }

  if (typeof FaceDetection !== 'undefined') {
    FaceDetection.stop();
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }

  const resImg = document.getElementById('result-img');
  if (resImg) {
    resImg.style.display = 'none';
    resImg.src = '';
  }

  const resActions = document.getElementById('tryon-result-actions');
  if (resActions) resActions.style.display = 'none';

  const guideOverlay = document.getElementById('camera-guide-overlay');
  if (guideOverlay) guideOverlay.style.display = 'none';

  const liveTools = document.getElementById('cam-live-tools');
  if (liveTools) liveTools.style.display = 'none';

  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';

  if (typeof stopTryOnProgress === 'function') {
    stopTryOnProgress();
  }

  const errBox = document.getElementById('error-box');
  if (errBox) errBox.style.display = 'none';

  const video = document.getElementById('video-feed');
  if (video) {
    video.style.display = 'none';
    video.srcObject = null;
  }

  const placeholder = document.getElementById('cam-placeholder');
  if (placeholder) placeholder.style.display = 'flex';

  const btnAct = document.getElementById('btn-activate');
  if (btnAct) btnAct.style.display = 'inline-flex';

  const btnShoot = document.getElementById('btn-shoot');
  if (btnShoot) btnShoot.style.display = 'none';

  actualizarBadgeGeneraciones();
}

window.addEventListener('DOMContentLoaded', actualizarBadgeGeneraciones);
