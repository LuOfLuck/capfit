// ── CAPFIT CONFIG ──
// Editá estos valores para personalizar el sitio

const CONFIG = {
  model3D:    'assets/gorra.glb',
  capImg1:    'assets/gorra_frente.jpg',
  capImg2:    'assets/gorra_lado.jpg',

  whatsapp:   '5491100000000',           // ← tu número sin + ni espacios
  whatsappMsg:'Hola! Vi la gorra en CAPFIT y me encantó. Quiero comprarla 🧢',

  falModel:   'fal-ai/fashn/tryon/v1.5',

  // En desarrollo local (node server.js) → usa el proxy en localhost:3000
  // En producción (Vercel) → las funciones serverless están en /api/
  // No necesitás cambiar nada — se detecta automáticamente.
  proxyBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? window.location.origin   // local: http://localhost:3000
    : '',                      // Vercel: rutas relativas /api/...
};