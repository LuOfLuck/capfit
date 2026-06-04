// ── CAPFIT CONFIG ──
// Editá estos valores para personalizar el sitio

const CONFIG = {
  model3D:    'assets/hat.glb',
  capImg1:    'assets/1.jpg',
  capImg2:    'assets/2.jpg',

  whatsapp:   '5491138607910',
  whatsappMsg:'Hola! Vi la gorra en CAPFIT y me encantó. Quiero comprarla 🧢',

  // Backends de try-on (en orden de prioridad)
  // 1. fal.ai - Mejor calidad, requiere créditos
  // 2. Kolors HF - Gratuito, funciona desde el browser
  // 3. Modo demo - Muestra la foto original si todo falla
  falModel:   'fal-ai/fashn/tryon/v1.5',

  // Kolors Virtual Try-On (gratuito, sin token)
  kolorsSpace: 'kwai-kolors/kolors-virtual-try-on',

  // proxyBase detecta automáticamente el entorno
  proxyBase: (function() {
    return window.location.origin;
  })(),
};

console.log('[CONFIG] proxyBase:', CONFIG.proxyBase);