// ── CAPFIT CONFIG ──
window.formatPrecio = function(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
};
window.formatPrice = window.formatPrecio;

const CONFIG = {
  whatsapp:   '5491138607910',      // ← tu número sin + ni espacios
  whatsappMsg:'Hola! Vi una gorra en CAPFIT y me encantó. ¡Quiero comprarla!',

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  MODELO DE IA — cambiá esta línea para testear
  //
  //  Opciones disponibles:
  //    'gpt-image-2'  → OpenAI GPT-Image-2 edit  (~$0.015 en low, mejor para gorras)
  //    'fashn-v1.6'   → FASHN Virtual Try-On v1.6 (~$0.075, especializado en ropa)
  //    'fashn-v1.5'   → FASHN Virtual Try-On v1.5 (~$0.075, versión anterior)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  aiModel: 'gpt-image-2',

  proxyBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? window.location.origin
    : '',
};