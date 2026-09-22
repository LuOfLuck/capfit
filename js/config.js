// ── CAPFIT CONFIG ──
window.formatPrecio = function(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
};
window.formatPrice = window.formatPrecio;

const CONFIG = {
  whatsapp:   '5491138607910',      // ← tu número sin + ni espacios
  whatsappMsg:'Hola! Vi una gorra en CAPFIT y me encantó. ¡Quiero comprarla!',

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  MODELO DE IA CENTRALIZADO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  aiModel: 'gpt-image-2.5-sunburst',
  aiModelRoute: 'openai/gpt-image-2.5/sunburst/edit',   // ruta exacta en fal.ai
  aiFallbackRoute: 'openai/gpt-image-2/edit',        // fallback si falla

  proxyBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? window.location.origin
    : '',
};

window.CONFIG = CONFIG;