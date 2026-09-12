/**
 * js/features/tryon/face-detection.js
 * Detección facial ligera en tiempo real para guía de encuadre (<200 líneas).
 */

const FaceDetection = (() => {
  let _modelLoaded = false;
  let _detecting = false;
  let _faceFound = false;
  let _animationId = null;
  let _videoEl = null;
  let _statusEl = null;
  let _lastDetectTime = 0;

  function getStatusElement() {
    if (!_statusEl) {
      const container = document.getElementById('camera-box');
      if (!container) return null;
      _statusEl = document.createElement('div');
      _statusEl.id = 'face-status';
      _statusEl.style.cssText = `
        position: absolute; top: 10px; left: 10px; padding: 6px 12px;
        border-radius: 20px; font-size: 0.76rem; font-weight: 600;
        z-index: 20; pointer-events: none; transition: all 0.25s ease;
        display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      `;
      container.appendChild(_statusEl);
    }
    _statusEl.style.display = 'flex';
    return _statusEl;
  }

  function updateStatus(detected) {
    const el = getStatusElement();
    if (!el) return;
    if (detected) {
      el.innerHTML = `✓ Rostro detectado`;
      el.style.background = 'rgba(34, 197, 94, 0.9)';
      el.style.color = '#ffffff';
    } else {
      el.innerHTML = `● Centrá tu rostro`;
      el.style.background = 'rgba(239, 68, 68, 0.9)';
      el.style.color = '#ffffff';
    }
  }

  function analyzeSkin(video) {
    if (!video || video.readyState < 2) return false;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 80; canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, 80, 100);
      const data = ctx.getImageData(0, 0, 80, 100).data;

      let skinCount = 0;
      for (let i = 0; i < data.length; i += 8) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 45 && g > 25 && b > 20 && r > g && r > b && (r - g) > 8) {
          skinCount++;
        }
      }
      return skinCount >= 80;
    } catch { return true; }
  }

  async function loop() {
    if (!_detecting || !_videoEl) return;
    const now = performance.now();
    if (now - _lastDetectTime >= 300) {
      _lastDetectTime = now;
      let found = false;
      if (typeof faceapi !== 'undefined' && faceapi.detectSingleFace) {
        try {
          const res = await faceapi.detectSingleFace(_videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }));
          if (res) found = true;
        } catch {}
      }
      if (!found) found = analyzeSkin(_videoEl);
      _faceFound = found;
      updateStatus(found);
    }
    if (_detecting) _animationId = requestAnimationFrame(loop);
  }

  function start(video) {
    _videoEl = video;
    _detecting = true;
    _animationId = requestAnimationFrame(loop);
  }

  function stop() {
    _detecting = false;
    _faceFound = false;
    if (_animationId) cancelAnimationFrame(_animationId);
    if (_statusEl) _statusEl.style.display = 'none';
  }

  return {
    start,
    stop,
    hasFace: () => _faceFound,
    isActive: () => _detecting,
    verifyFace: async (el) => analyzeSkin(el)
  };
})();

window.FaceDetection = FaceDetection;
