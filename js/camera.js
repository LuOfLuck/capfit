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
let currentFacingMode = 'user';
let isCountdownActive = false;
let countdownTimer = null;

async function activateCamera() {
  try {
    // Hide previous generated image, buy banner and error box
    const resImg = document.getElementById('result-img');
    if (resImg) {
      resImg.style.display = 'none';
      resImg.src = '';
    }

    const buyBanner = document.getElementById('buy-direct-banner');
    if (buyBanner) buyBanner.style.display = 'none';

    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';

    const errBox = document.getElementById('error-box');
    if (errBox) errBox.style.display = 'none';

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode, width: { ideal: 576 }, height: { ideal: 768 }, aspectRatio: { ideal: 0.75 } }
    });
    const v = document.getElementById('video-feed');
    if (!v) return;
    v.srcObject = mediaStream;
    v.style.display = 'block';

    const ph = document.getElementById('cam-placeholder');
    if (ph) ph.style.display = 'none';

    const poseGuide = document.getElementById('cam-pose-guide');
    if (poseGuide) {
      poseGuide.style.display = 'flex';
      poseGuide.style.opacity = '1';
    }

    const flipBtn = document.getElementById('cam-flip-btn');
    if (flipBtn) flipBtn.style.display = 'flex';

    const btnAct = document.getElementById('btn-activate');
    if (btnAct) btnAct.style.display = 'none';

    const btnShoot = document.getElementById('btn-shoot');
    if (btnShoot) btnShoot.style.display = 'inline-flex';

    v.onloadedmetadata = () => {
      if (typeof FaceDetection !== 'undefined') {
        FaceDetection.start(v);
      }
    };
  } catch (e) {
    console.warn('[Camera] No camera permission or failed to access:', e);
  }
}

async function toggleCamera() {
  currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  await activateCamera();
}

function takePhoto(skipCountdown = false) {
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

  if (skipCountdown) {
    cancelCountdown();
    executeTakePhoto(item);
    return;
  }

  if (isCountdownActive) return;

  startCountdown(() => {
    executeTakePhoto(item);
  });
}

function startCountdown(onComplete) {
  const overlay = document.getElementById('cam-countdown-overlay');
  const numEl = document.getElementById('countdown-num');
  if (!overlay || !numEl) {
    onComplete();
    return;
  }

  isCountdownActive = true;
  overlay.style.display = 'flex';

  const poseGuide = document.getElementById('cam-pose-guide');
  if (poseGuide) poseGuide.style.opacity = '0.3';

  let count = 3;
  numEl.textContent = count;
  numEl.classList.remove('animate-pop');
  void numEl.offsetWidth;
  numEl.classList.add('animate-pop');

  countdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
      numEl.classList.remove('animate-pop');
      void numEl.offsetWidth;
      numEl.classList.add('animate-pop');
    } else if (count === 0) {
      numEl.textContent = '📸';
      numEl.classList.remove('animate-pop');
      void numEl.offsetWidth;
      numEl.classList.add('animate-pop');
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      isCountdownActive = false;
      overlay.style.display = 'none';
      if (poseGuide) poseGuide.style.opacity = '1';
      onComplete();
    }
  }, 850);
}

function cancelCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  isCountdownActive = false;
  const overlay = document.getElementById('cam-countdown-overlay');
  if (overlay) overlay.style.display = 'none';
}

function executeTakePhoto(item) {
  if (typeof FaceDetection !== 'undefined') {
    FaceDetection.stop();
  }

  const video = document.getElementById('video-feed');
  const canvas = document.getElementById('photo-canvas');
  if (!video || !canvas) return;

  const maxW = CONFIG.aiModel === 'gpt-image-2' ? 512 : 768;
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

  // Flip horizontally only for front user camera
  if (currentFacingMode === 'user') {
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, -canvasW, 0, canvasW, canvasH);
  } else {
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvasW, canvasH);
  }
  ctx.restore();

  const quality = CONFIG.aiModel === 'gpt-image-2' ? 0.75 : 0.80;
  const dataURL = canvas.toDataURL('image/jpeg', quality);

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  video.style.display = 'none';

  const poseGuide = document.getElementById('cam-pose-guide');
  if (poseGuide) poseGuide.style.display = 'none';

  const flipBtn = document.getElementById('cam-flip-btn');
  if (flipBtn) flipBtn.style.display = 'none';

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

  const buyBanner = document.getElementById('buy-direct-banner');
  if (buyBanner) buyBanner.style.display = 'none';

  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'none';

  const poseGuide = document.getElementById('cam-pose-guide');
  if (poseGuide) poseGuide.style.display = 'none';

  const flipBtn = document.getElementById('cam-flip-btn');
  if (flipBtn) flipBtn.style.display = 'none';

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

// ── Watermark & Direct Share/Download ──
async function downloadOrShareWithWatermark(action) {
  const resultImg = document.getElementById('result-img');
  if (!resultImg || !resultImg.src || resultImg.style.display === 'none') {
    alert('No hay una foto procesada lista para descargar o compartir.');
    return;
  }

  const gorra = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  const capName = gorra ? gorra.nombre : 'Gorra CapFit';

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = resultImg.src;

    await new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) resolve();
      else {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Error al cargar la imagen'));
      }
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 800;
    canvas.height = img.naturalHeight || 1066;
    const ctx = canvas.getContext('2d');

    // 1. Draw image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 2. Draw stylish CapFit Watermark Bar at bottom
    const barHeight = Math.round(canvas.height * 0.11);
    const barY = canvas.height - barHeight;

    const grad = ctx.createLinearGradient(0, barY - 30, 0, canvas.height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.35, 'rgba(15, 23, 42, 0.78)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.96)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, barY - 30, canvas.width, barHeight + 30);

    // Green accent divider line
    ctx.fillStyle = '#10B981';
    ctx.fillRect(0, barY - 2, canvas.width, 3);

    // CapFit Brand title
    const fontSize = Math.max(16, Math.round(canvas.width * 0.04));
    ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('CAPFIT', fontSize, barY + barHeight * 0.42);

    // Subtitle / Cap name
    const subSize = Math.max(11, Math.round(fontSize * 0.62));
    ctx.font = `600 ${subSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(`Probador IA • ${capName}`, fontSize, barY + barHeight * 0.72);

    // Domain tag right
    ctx.font = `700 ${subSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    ctx.fillStyle = '#10B981';
    ctx.textAlign = 'right';
    ctx.fillText('capfit.com', canvas.width - fontSize, barY + barHeight * 0.55);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    if (action === 'download') {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `capfit-${capName.toLowerCase().replace(/\s+/g, '-')}-probador.jpg`;
      a.click();
    } else if (action === 'share') {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `capfit-${capName.toLowerCase().replace(/\s+/g, '-')}.jpg`, { type: 'image/jpeg' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `CapFit - Probador Virtual (${capName})`,
            text: `¡Mirá cómo me queda la gorra ${capName} probada con IA en CapFit!`,
            files: [file]
          });
        } else if (navigator.share) {
          await navigator.share({
            title: `CapFit - Probador Virtual (${capName})`,
            text: `¡Mirá cómo me queda la gorra ${capName} probada con IA en CapFit! capfit.com`,
            url: window.location.href
          });
        } else {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `capfit-${capName.toLowerCase().replace(/\s+/g, '-')}-probador.jpg`;
          a.click();
          alert('Foto con marca CapFit descargada. ¡Ya podés compartirla en tus redes!');
        }
      } catch (shareErr) {
        console.warn('Share error fallback to download:', shareErr);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `capfit-${capName.toLowerCase().replace(/\s+/g, '-')}-probador.jpg`;
        a.click();
      }
    }
  } catch (err) {
    console.warn('Error applying watermark:', err);
    // Fallback: download direct image
    const a = document.createElement('a');
    a.href = resultImg.src;
    a.download = `capfit-tryon.jpg`;
    a.click();
  }
}

window.addEventListener('DOMContentLoaded', actualizarBadgeGeneraciones);
