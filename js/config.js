// ── CAPFIT CONFIG ──
// Editá estos valores para personalizar el sitio

const CONFIG = {
  model3D:    'assets/hat.glb',
  capImg1:    'assets/1.jpg',
  capImg2:    'assets/2.jpg',

  whatsapp:   '5491100000000',           // ← tu número sin + ni espacios
  whatsappMsg:'Hola! Vi la gorra en CAPFIT y me encantó. Quiero comprarla 🧢',

  falModel:   'fal-ai/fashn/tryon/v1.5',

  proxyBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? window.location.origin   // local: http://localhost:3000
    : '',                      // Vercel: rutas relativas /api/...
};