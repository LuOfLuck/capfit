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

async function activateCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 768 }, height: { ideal: 576 } }
    });
    const v = document.getElementById('video-feed');
    if (!v) return;
    v.srcObject = mediaStream;
    v.style.display = 'block';

    const ph = document.getElementById('cam-placeholder');
    if (ph) ph.style.display = 'none';

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
    console.warn('[Camera] No camera permission:', e);
  }
}

function takePhoto() {
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

  if (typeof FaceDetection !== 'undefined') {
    FaceDetection.stop();
  }

  const video = document.getElementById('video-feed');
  const canvas = document.getElementById('photo-canvas');
  if (!video || !canvas) return;

  const maxW = CONFIG.aiModel === 'gpt-image-2' ? 512 : 768;
  const ratio = (video.videoHeight || 480) / (video.videoWidth || 640);
  canvas.width = Math.min(video.videoWidth || 640, maxW);
  canvas.height = Math.round(canvas.width * ratio) || Math.round(maxW * 0.75);

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  const quality = CONFIG.aiModel === 'gpt-image-2' ? 0.75 : 0.80;
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

  const errBox = document.getElementById('error-box');
  if (errBox) errBox.style.display = 'none';

  const video = document.getElementById('video-feed');
  if (video) video.style.display = 'none';

  const placeholder = document.getElementById('cam-placeholder');
  if (placeholder) placeholder.style.display = 'flex';

  const btnAct = document.getElementById('btn-activate');
  if (btnAct) btnAct.style.display = 'inline-flex';

  const btnShoot = document.getElementById('btn-shoot');
  if (btnShoot) btnShoot.style.display = 'none';

  actualizarBadgeGeneraciones();
}

window.addEventListener('DOMContentLoaded', actualizarBadgeGeneraciones);
