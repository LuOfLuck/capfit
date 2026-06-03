// ── Cámara y captura de foto ──
let mediaStream = null;

async function activateCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    const v = document.getElementById('video-feed');
    v.srcObject = mediaStream;
    v.style.display = 'block';
    document.getElementById('cam-placeholder').style.display = 'none';
    document.getElementById('btn-activate').style.display = 'none';
    document.getElementById('btn-shoot').style.display = 'flex';
  } catch (e) {
    console.error('Error cámara:', e);
    alert('No se pudo acceder a la cámara. Habilitá los permisos.');
  }
}

function takePhoto() {
  const video  = document.getElementById('video-feed');
  const canvas = document.getElementById('photo-canvas');
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  // Unflip the mirrored preview
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0);
  ctx.restore();
  const dataURL = canvas.toDataURL('image/jpeg', 0.92);

  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  document.getElementById('video-feed').style.display = 'none';

  const rs = document.getElementById('result-section');
  rs.style.display = 'block';
  setTimeout(() => rs.scrollIntoView({ behavior: 'smooth' }), 80);

  // Obtener la imagen frontal de la gorra activa
  let garmentPath = null;
  if (typeof gorraActiva !== 'undefined' && gorraActiva) {
    garmentPath = gorraActiva.imgFrontal || gorraActiva.imgPreview;
    console.log('[Camera] Gorra activa:', gorraActiva.nombre, '- imgFrontal:', garmentPath);
  } else {
    console.warn('[Camera] No hay gorra activa seleccionada');
  }

  resetResult();

  // Pasar tanto la foto como la imagen de la gorra
  runVirtualTryOn(dataURL, garmentPath);
  showPiropo();
}

function retryPhoto() {
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('btn-activate').style.display = 'block';
  document.getElementById('btn-shoot').style.display = 'none';
  document.getElementById('cam-placeholder').style.display = 'flex';
  document.getElementById('video-feed').style.display = 'none';
  document.getElementById('piropo-text').textContent = '…';
  document.getElementById('try-section').scrollIntoView({ behavior: 'smooth' });
}