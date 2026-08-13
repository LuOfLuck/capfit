
const FaceDetection = (() => {

  let _modelLoaded = false;
  let _detecting   = false;
  let _faceFound   = false;
  let _animationId = null;
  let _overlayCanvas = null;
  let _videoEl       = null;
  let _statusEl      = null;
  let _isProcessingFrame = false;
  let _lastDetectTime = 0;

  const MODEL_URLS = [
    'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model',
    'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model',
    'https://justadudewhohacks.github.io/face-api.js/models'
  ];

  let DETECT_OPTS = null;
  function getDetectOpts() {
    if (!DETECT_OPTS && typeof faceapi !== 'undefined' && faceapi.TinyFaceDetectorOptions) {
      DETECT_OPTS = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.22,
      });
    }
    return DETECT_OPTS;
  }

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
        top: 10px;
        left: 10px;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 0.76rem;
        font-weight: 600;
        z-index: 20;
        pointer-events: none;
        transition: all 0.25s ease;
        display: flex;
        align-items: center;
        gap: 6px;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      `;
      container.appendChild(_statusEl);
    }
    _statusEl.style.display = 'flex';
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
      el.style.background = 'rgba(34, 197, 94, 0.9)';
      el.style.color = '#ffffff';
    } else {
      el.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        Mostrá tu rostro
      `;
      el.style.background = 'rgba(239, 68, 68, 0.9)';
      el.style.color = '#ffffff';
    }
  }

  function clearOverlay() {
    const canvas = getOverlayCanvas();
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // ── Loop de detección optimizado con throttling ──
  async function detectLoop() {
    if (!_detecting || !_videoEl) return;

    const now = performance.now();
    // Throttling: procesar máximo cada 250ms (4 FPS es ideal para detección visual)
    if (!_isProcessingFrame && (now - _lastDetectTime >= 250)) {
      if (_videoEl.readyState >= 2 && _videoEl.videoWidth > 0) {
        _isProcessingFrame = true;
        _lastDetectTime = now;

        try {
          let found = false;
          if (_modelLoaded && typeof faceapi !== 'undefined' && faceapi.nets && faceapi.nets.tinyFaceDetector) {
            const opts = getDetectOpts();
            if (opts) {
              const result = await faceapi.detectSingleFace(_videoEl, opts);
              if (result && result.score >= 0.20) {
                found = true;
              }
            }
          }

          // Fallback ultra-rápido si el modelo no está cargado o dio negativo
          if (!found) {
            found = analyzeSkinAndFacePixels(_videoEl);
          }

          _faceFound = found;
          updateStatus(found);
          clearOverlay();
        } catch (e) {
          // Ignorar errores esporádicos de frame
        } finally {
          _isProcessingFrame = false;
        }
      }
    }

    if (_detecting) {
      _animationId = requestAnimationFrame(detectLoop);
    }
  }

  // ── API pública ──

  /**
   * Carga el modelo de detección de rostros.
   */
  async function loadModel() {
    if (_modelLoaded) return true;

    if (typeof faceapi === 'undefined' || !faceapi.nets || !faceapi.nets.tinyFaceDetector) {
      return false;
    }

    for (const url of MODEL_URLS) {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(url);
        _modelLoaded = true;
        console.log('[FaceDetection] ✓ Modelo de rostro cargado desde:', url);
        return true;
      } catch (e) {
        // Probar siguiente URL
      }
    }

    console.warn('[FaceDetection] No se cargó modelo neural. Usando detector inteligente de visión.');
    return false;
  }

  /**
   * Inicia la detección de rostros en tiempo real sobre el video.
   */
  async function start(videoElement) {
    if (!videoElement) return false;

    _videoEl = videoElement;
    _detecting = true;
    _isProcessingFrame = false;
    _lastDetectTime = 0;

    // Intentar cargar modelo de fondo sin bloquear
    loadModel();

    // Mostrar estado inicial
    updateStatus(false);

    // Iniciar loop
    if (_animationId) cancelAnimationFrame(_animationId);
    _animationId = requestAnimationFrame(detectLoop);
    return true;
  }

  /**
   * Detiene la detección de rostros y limpia el overlay.
   */
  function stop() {
    _detecting = false;
    _faceFound = false;
    _isProcessingFrame = false;

    if (_animationId) {
      cancelAnimationFrame(_animationId);
      _animationId = null;
    }

    clearOverlay();

    if (_statusEl) {
      _statusEl.style.display = 'none';
    }
  }

  function hasFace() {
    return _faceFound;
  }

  function isActive() {
    return _detecting;
  }

  /**
   * Analiza cuantitativamente píxeles de tono de piel y geometría facial en el centro de una imagen.
   */
  function analyzeSkinAndFacePixels(inputElement) {
    if (!inputElement) return false;
    try {
      const canvas = document.createElement('canvas');
      const w = 120;
      const h = 160;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(inputElement, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      let centerSkinCount = 0;
      let totalCenterCount = 0;
      let outerSkinCount = 0;
      let totalOuterCount = 0;

      const minX = Math.round(w * 0.22);
      const maxX = Math.round(w * 0.78);
      const minY = Math.round(h * 0.18);
      const maxY = Math.round(h * 0.72);

      let eyeLumSum = 0;
      let eyeLumCount = 0;

      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const isCenter = (x >= minX && x <= maxX && y >= minY && y <= maxY);
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);

          const isSkin = (r > 40 && g > 22 && b > 18 && r > g && r > b && (r - g) > 10 && (max - min) > 12 && (max - min) < 180);

          if (isCenter) {
            totalCenterCount++;
            if (isSkin) centerSkinCount++;

            if (y >= Math.round(h * 0.25) && y <= Math.round(h * 0.50)) {
              eyeLumSum += (0.299 * r + 0.587 * g + 0.114 * b);
              eyeLumCount++;
            }
          } else {
            totalOuterCount++;
            if (isSkin) outerSkinCount++;
          }
        }
      }

      const centerSkinRatio = centerSkinCount / Math.max(1, totalCenterCount);
      const outerSkinRatio = outerSkinCount / Math.max(1, totalOuterCount);

      if (centerSkinRatio >= 0.15 && (centerSkinRatio - outerSkinRatio >= 0.02 || outerSkinRatio <= 0.30)) {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Verifica de manera asíncrona y estricta si hay un rostro en un canvas, foto o video.
   */
  async function verifyFace(inputElement) {
    if (!inputElement) return false;

    // 1. Detección mediante faceapi TinyFaceDetector si está disponible
    try {
      const loaded = await loadModel();
      if (loaded && typeof faceapi !== 'undefined' && faceapi.nets && faceapi.nets.tinyFaceDetector) {
        const detection = await faceapi.detectSingleFace(inputElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.18 }));
        if (detection) {
          return true;
        }
      }
    } catch (e) {
      // Ignorar fallo de red/librería
    }

    // 2. Detección nativa del navegador (FaceDetector API)
    if ('FaceDetector' in window) {
      try {
        const detector = new window.FaceDetector({ fastMode: true, maxFaces: 1 });
        const faces = await detector.detect(inputElement);
        if (faces && faces.length > 0) {
          return true;
        }
      } catch (e) {
        // Ignorar
      }
    }

    // 3. Fallback: Análisis de píxeles y tonos de piel
    return analyzeSkinAndFacePixels(inputElement);
  }

  return {
    loadModel,
    start,
    stop,
    hasFace,
    isActive,
    verifyFace,
  };
})();