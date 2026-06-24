// ── Detección de rostro con Face-API.js ──
// Valida que haya al menos un rostro visible antes de permitir tomar la foto
// Usa TinyFaceDetector — liviano y rápido para uso en tiempo real

const FaceDetection = (() => {
  // ── Estado ──
  let _modelLoaded = false;
  let _detecting   = false;
  let _faceFound   = false;
  let _animationId = null;
  let _overlayCanvas = null;
  let _videoEl       = null;
  let _statusEl      = null;

  // ── Configuración ──
  const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
  const DETECT_OPTS = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,   // 128..512 — 320 es buen balance velocidad/precisión
    scoreThreshold: 0.5, // 0..1 — confianza mínima para considerar un rostro
  });

  // ── Referencias a elementos del DOM ──
  function getOverlayCanvas() {
    if (!_overlayCanvas) {
      const container = document.getElementById('camera-box');
      if (!container) return null;

      _overlayCanvas = document.createElement('canvas');
      _overlayCanvas.id = 'face-overlay';
      _overlayCanvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
      `;
      container.style.position = 'relative';
      container.appendChild(_overlayCanvas);
    }
    return _overlayCanvas;
  }

  function getStatusElement() {
    if (!_statusEl) {
      const container = document.getElementById('camera-box');
      if (!container) return null;

      _statusEl = document.createElement('div');
      _statusEl.id = 'face-status';
      _statusEl.style.cssText = `
        position: absolute;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 0.78rem;
        font-weight: 500;
        font-family: 'DM Sans', sans-serif;
        z-index: 6;
        pointer-events: none;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 6px;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      `;
      container.appendChild(_statusEl);
    }
    return _statusEl;
  }

  // ── Actualizar indicador visual de estado ──
  function updateStatus(detected) {
    const el = getStatusElement();
    if (!el) return;

    if (detected) {
      el.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Rostro detectado
      `;
      el.style.background = 'rgba(46, 204, 113, 0.85)';
      el.style.color = '#fff';
    } else {
      el.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Mostrá tu rostro
      `;
      el.style.background = 'rgba(231, 76, 60, 0.85)';
      el.style.color = '#fff';
    }
  }

  // ── Dibujar recuadro alrededor del rostro ──
  function drawDetection(detection) {
    const canvas = getOverlayCanvas();
    if (!canvas || !_videoEl) return;

    // Ajustar tamaño del canvas al video
    const rect = _videoEl.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!detection) return;

    const box = detection.box;
    // El video puede tener mirror (scaleX(-1)), ajustamos coordenadas
    const x = canvas.width - (box.x / _videoEl.videoWidth * canvas.width) - (box.width / _videoEl.videoWidth * canvas.width);
    const y = box.y / _videoEl.videoHeight * canvas.height;
    const w = box.width / _videoEl.videoWidth * canvas.width;
    const h = box.height / _videoEl.videoHeight * canvas.height;

    // Recuadro con esquinas redondeadas
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.strokeStyle = 'rgba(46, 204, 113, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Sombra interior sutil
    ctx.fillStyle = 'rgba(46, 204, 113, 0.06)';
    ctx.fill();

    // Puntos en las esquinas (efecto "enfoque")
    const cornerLen = 12;
    ctx.strokeStyle = 'rgba(46, 204, 113, 1)';
    ctx.lineWidth = 3;

    // Esquina superior izquierda
    ctx.beginPath();
    ctx.moveTo(x, y + cornerLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerLen, y);
    ctx.stroke();

    // Esquina superior derecha
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + cornerLen);
    ctx.stroke();

    // Esquina inferior izquierda
    ctx.beginPath();
    ctx.moveTo(x, y + h - cornerLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + cornerLen, y + h);
    ctx.stroke();

    // Esquina inferior derecha
    ctx.beginPath();
    ctx.moveTo(x + w - cornerLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - cornerLen);
    ctx.stroke();
  }

  // ── Limpiar canvas ──
  function clearOverlay() {
    const canvas = getOverlayCanvas();
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ── Loop de detección ──
  async function detectLoop() {
    if (!_detecting || !_videoEl) return;

    // Solo detectar si el video está listo y visible
    if (_videoEl.readyState >= 2 && _videoEl.videoWidth > 0) {
      try {
        const result = await faceapi.detectSingleFace(_videoEl, DETECT_OPTS);

        if (result) {
          _faceFound = true;
          updateStatus(true);
          drawDetection(result);
        } else {
          _faceFound = false;
          updateStatus(false);
          clearOverlay();
        }
      } catch (e) {
        console.warn('[FaceDetection] Error en detección:', e.message);
      }
    }

    _animationId = requestAnimationFrame(detectLoop);
  }

  // ── API pública ──

  /**
   * Carga el modelo de detección de rostros.
   * Debe llamarse una sola vez antes de iniciar la detección.
   */
  async function loadModel() {
    if (_modelLoaded) return true;

    try {
      console.log('[FaceDetection] Cargando modelo TinyFaceDetector...');
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      _modelLoaded = true;
      console.log('[FaceDetection] ✓ Modelo cargado correctamente');
      return true;
    } catch (e) {
      console.error('[FaceDetection] ✗ Error cargando modelo:', e.message);
      return false;
    }
  }

  /**
   * Inicia la detección de rostros en tiempo real sobre el video.
   * @param {HTMLVideoElement} videoElement — el elemento <video> de la cámara
   */
  async function start(videoElement) {
    if (!videoElement) {
      console.error('[FaceDetection] No se proporcionó elemento video');
      return false;
    }

    // Cargar modelo si aún no está cargado
    const loaded = await loadModel();
    if (!loaded) return false;

    _videoEl = videoElement;
    _detecting = true;

    // Mostrar estado inicial
    updateStatus(false);

    // Iniciar loop
    detectLoop();
    console.log('[FaceDetection] Detección iniciada');
    return true;
  }

  /**
   * Detiene la detección de rostros y limpia el overlay.
   */
  function stop() {
    _detecting = false;
    _faceFound = false;

    if (_animationId) {
      cancelAnimationFrame(_animationId);
      _animationId = null;
    }

    clearOverlay();

    // Ocultar status
    if (_statusEl) {
      _statusEl.style.display = 'none';
    }

    console.log('[FaceDetection] Detección detenida');
  }

  /**
   * Devuelve true si se detectó al menos un rostro en el frame actual.
   */
  function hasFace() {
    return _faceFound;
  }

  /**
   * Devuelve true si la detección está activa.
   */
  function isActive() {
    return _detecting;
  }

  return {
    loadModel,
    start,
    stop,
    hasFace,
    isActive,
  };
})();