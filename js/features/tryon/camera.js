/**
 * js/features/tryon/camera.js
 * Control de webcam, alternancia de cámara frontal/trasera y captura (<200 líneas).
 */

let mediaStream = null;
let currentFacingMode = 'user';
let countdownInterval = null;

async function activateCamera() {
  try {
    cancelCountdown();
    if (typeof FaceDetection !== 'undefined') FaceDetection.stop();

    const v = document.getElementById('video-feed');
    if (v) { v.pause(); v.srcObject = null; }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }

    const isFront = (currentFacingMode === 'user');
    const constraints = {
      video: { facingMode: isFront ? 'user' : 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
    };

    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (!v) return;

    v.srcObject = mediaStream;
    v.style.display = 'block';
    v.style.transform = isFront ? 'scaleX(-1)' : 'scaleX(1)';
    await v.play();

    const ph = document.getElementById('cam-placeholder');
    if (ph) ph.style.display = 'none';

    const btnAct = document.getElementById('btn-activate');
    if (btnAct) btnAct.style.display = 'none';

    const btnShoot = document.getElementById('btn-shoot');
    if (btnShoot) btnShoot.style.display = 'inline-flex';

    const liveTools = document.getElementById('cam-live-tools');
    if (liveTools) liveTools.style.display = 'flex';

    if (typeof FaceDetection !== 'undefined') FaceDetection.start(v);
  } catch (e) {
    console.warn('[Camera] Error iniciando cámara:', e);
    alert('No se pudo acceder a la cámara. Verificá los permisos del navegador.');
  }
}

async function switchCamera() {
  cancelCountdown();
  currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
  await activateCamera();
}

function takePhoto() {
  startCountdownAndSnap();
}

function cancelCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  const overlay = document.getElementById('countdown-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function startCountdownAndSnap() {
  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  if (!item) {
    alert('Primero elegí una gorra del catálogo.');
    return;
  }

  const overlay = document.getElementById('countdown-overlay');
  const numEl = document.getElementById('countdown-number');
  if (!overlay || !numEl) {
    executeTakePhoto();
    return;
  }

  cancelCountdown();
  overlay.style.display = 'flex';
  let count = 3;
  numEl.textContent = count;

  countdownInterval = setInterval(() => {
    count--;
    if (count > 0) {
      numEl.textContent = count;
    } else if (count === 0) {
      numEl.textContent = '¡Sonreí!';
    } else {
      cancelCountdown();
      executeTakePhoto();
    }
  }, 900);
}

async function executeTakePhoto() {
  cancelCountdown();
  const video = document.getElementById('video-feed');
  const canvas = document.getElementById('photo-canvas');
  if (!video || !canvas) return;

  const item = (window.Store && Store.getGorraActiva) ? Store.getGorraActiva() : window.gorraActiva;
  const maxW = 768;
  const videoW = video.videoWidth || 640;
  const videoH = video.videoHeight || 480;

  const targetRatio = 4 / 3;
  const canvasW = Math.min(videoW, maxW);
  const canvasH = Math.round(canvasW * targetRatio);
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');
  ctx.save();
  if (currentFacingMode === 'user') {
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, videoW, videoH, -canvasW, 0, canvasW, canvasH);
  } else {
    ctx.drawImage(video, 0, 0, videoW, videoH, 0, 0, canvasW, canvasH);
  }
  ctx.restore();

  if (typeof FaceDetection !== 'undefined') FaceDetection.stop();

  const dataURL = canvas.toDataURL('image/jpeg', 0.85);

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  video.style.display = 'none';

  const btnShoot = document.getElementById('btn-shoot');
  if (btnShoot) btnShoot.style.display = 'none';

  const btnAct = document.getElementById('btn-activate');
  if (btnAct) btnAct.style.display = 'inline-flex';

  if (typeof resetResult === 'function') resetResult();
  runVirtualTryOn(dataURL, item.imgFrontal || item.imgPreview);
}

function retryPhoto() {
  cancelCountdown();
  if (typeof stopRealTryOnProgress === 'function') stopRealTryOnProgress();
  if (typeof FaceDetection !== 'undefined') FaceDetection.stop();

  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }

  const resImg = document.getElementById('result-img');
  if (resImg) { resImg.style.display = 'none'; resImg.src = ''; }

  const resActions = document.getElementById('tryon-result-actions');
  if (resActions) resActions.style.display = 'none';

  const errBox = document.getElementById('error-box');
  if (errBox) errBox.style.display = 'none';

  const video = document.getElementById('video-feed');
  if (video) { video.style.display = 'none'; video.srcObject = null; }

  const placeholder = document.getElementById('cam-placeholder');
  if (placeholder) placeholder.style.display = 'flex';

  const btnAct = document.getElementById('btn-activate');
  if (btnAct) btnAct.style.display = 'inline-flex';

  const btnShoot = document.getElementById('btn-shoot');
  if (btnShoot) btnShoot.style.display = 'none';
}

window.activateCamera = activateCamera;
window.switchCamera = switchCamera;
window.takePhoto = takePhoto;
window.retryPhoto = retryPhoto;
