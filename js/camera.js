// ── Cámara, captura y límite de generaciones ──

const MAX_GENERACIONES = 3;
const RESET_MS = 2 * 60 * 60 * 1000; // 2 horas en ms
const LS_KEY = 'capfit_gen';

// ── Gestión del límite ──
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
    // Pasaron 2hs — resetear
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

// ── Actualizar badge de generaciones en el botón ──
function actualizarBadgeGeneraciones() {
  const badge = document.getElementById('gen-badge');
  if (!badge) return;
  const restantes = generacionesRestantes();
  if (restantes === 0) {
    const t = tiempoRestante();
    badge.textContent = `Sin usos restantes${t ? ' · Reinicia en ' + t : ''}`;
    badge.style.color = '#c00';
    badge.style.setProperty('--dot-color', '#c00');
    badge.classList.add('agotado');
  } else {
    badge.textContent = `${restantes} de ${MAX_GENERACIONES} usos restantes`;
    badge.style.color = '';
    badge.classList.remove('agotado');
  }
}

// ── Cámara ──
let mediaStream = null;

async function activateCamera() {
  try {
    // Pedir resolución más baja directo — ahorra procesamiento
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 768 }, height: { ideal: 576 } }
    });
    const v = document.getElementById('video-feed');
    v.srcObject = mediaStream;
    v.style.display = 'block';
    document.getElementById('cam-placeholder').style.display = 'none';
    document.getElementById('btn-activate').style.display = 'none';
    document.getElementById('btn-shoot').style.display = 'flex';
  } catch (e) {
    alert('No se pudo acceder a la cámara. Habilitá los permisos.');
  }
}

function takePhoto() {
  if (!gorraActiva) {
    alert('Primero elegí una gorra del catálogo.');
    return;
  }

  // ── Verificar límite ANTES de procesar ──
  if (!puedeGenerar()) {
    const t = tiempoRestante();
    mostrarLimiteAlcanzado(t);
    return;
  }

  const video  = document.getElementById('video-feed');
  const canvas = document.getElementById('photo-canvas');

  // Resolución y calidad según el motor activo
  // GPT-Image-2 cobra por tokens de imagen → usamos 512px
  // FASHN no cobra por tamaño → usamos 768px
  const maxW  = CONFIG.aiModel === 'gpt-image-2' ? 512 : 768;
  const ratio = video.videoHeight / video.videoWidth;
  canvas.width  = Math.min(video.videoWidth || 640, maxW);
  canvas.height = Math.round(canvas.width * ratio) || Math.round(maxW * 0.75);

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();

  // Calidad JPEG: 0.75 para GPT-Image-2 (menos tokens), 0.80 para FASHN
  const quality = CONFIG.aiModel === 'gpt-image-2' ? 0.75 : 0.80;
  const dataURL = canvas.toDataURL('image/jpeg', quality);
  console.log(`[camera] foto: ${canvas.width}×${canvas.height}px, calidad ${quality}`);

  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  document.getElementById('video-feed').style.display = 'none';

  // Registrar uso
  registrarGeneracion();
  actualizarBadgeGeneraciones();

  // Mostrar sección resultado
  const rs = document.getElementById('result-section');
  rs.style.display = 'block';
  setTimeout(() => rs.scrollIntoView({ behavior: 'smooth' }), 80);

  // Rellenar card resultado
  document.getElementById('result-cap-img').src            = gorraActiva.imgPreview;
  document.getElementById('result-cap-nombre').textContent = gorraActiva.nombre;
  document.getElementById('result-cap-precio').textContent = formatPrecio(gorraActiva.precio);

  resetResult();
  runVirtualTryOn(dataURL, gorraActiva.imgFrontal);
  showPiropo();
}

function mostrarLimiteAlcanzado(tiempoStr) {
  // Mostrar sección resultado con mensaje de límite
  const rs = document.getElementById('result-section');
  rs.style.display = 'block';
  setTimeout(() => rs.scrollIntoView({ behavior: 'smooth' }), 80);

  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('result-img').style.display = 'none';

  const eb = document.getElementById('error-box');
  document.getElementById('error-msg').innerHTML =
    `Alcanzaste el límite de ${MAX_GENERACIONES} pruebas gratuitas.<br>` +
    (tiempoStr ? `Podés volver a intentarlo en <strong>${tiempoStr}</strong>.` : 'Volvé pronto.');
  eb.style.display = 'flex';
}

function retryPhoto() {
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('error-box').style.display = 'none';
  document.getElementById('btn-activate').style.display = 'block';
  document.getElementById('btn-shoot').style.display = 'none';
  document.getElementById('cam-placeholder').style.display = 'flex';
  document.getElementById('video-feed').style.display = 'none';
  document.getElementById('piropo-text').textContent = '…';
  actualizarBadgeGeneraciones();
  document.getElementById('try-section').scrollIntoView({ behavior: 'smooth' });
}

// Inicializar badge al cargar
window.addEventListener('DOMContentLoaded', actualizarBadgeGeneraciones);