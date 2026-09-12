// ── CAPFIT CONFIG ──
if (typeof window !== 'undefined') {
  window.formatPrecio = function(n) {
    return '$' + Number(n || 0).toLocaleString('es-AR');
  };
  window.formatPrice = window.formatPrecio;
}

const CONFIG = {
  whatsapp:   '5491138607910',
  whatsappMsg:'Hola! Vi una gorra en CAPFIT y me encantó. ¡Quiero comprarla!',

  // ── MODELO DE IA PARA PROBADOR VIRTUAL (TRY-ON) ──
  // Opciones reales en fal.ai:
  // 'gpt-image-2.5-flare'    → rápido, calidad mayor que gpt-image-2, ~$0.0059 low / $0.0132 medium / $0.0527 high por imagen 1024x1024
  // 'gpt-image-2.5-sunburst' → máximo detalle, más lento, mismo precio (reservado para foto HD premium futura)
  // 'gpt-image-2'            → versión anterior (fallback)
  aiModel: 'gpt-image-2.5-sunburst',
  aiModelRoute: 'openai/gpt-image-2.5/sunburst/edit', // ruta exacta en fal.ai (máximo detalle)
  aiFallbackRoute: 'openai/gpt-image-2/edit',         // fallback si falla
  aiQuality: 'low',                                   // modelo/calidad low (~$0.0059 por 1024x1024, ~$0.0025 por 512x512)
  aiImageSize: 'auto',                                // 'auto' respeta la relación de aspecto exacta de la foto del usuario sin inventar bordes ni zonas extra

  proxyBase: (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? window.location.origin
    : '',

  // Prompts configurables por tipo de producto para fal.ai (GPT-Image-2.5 / GPT-Image-2)
  promptsPorTipo: {
    gorra: 'Pone la gorra a esta persona',
    anteojo: 'Pone los anteojos a esta persona',
    anteojos: 'Pone los anteojos a esta persona',
    gorro: 'Pone el gorro a esta persona',
    remera: 'Pone la remera a esta persona',
    buzo: 'Pone el buzo a esta persona',
    campera: 'Pone la campera a esta persona',
    pantalon: 'Pone el pantalón a esta persona',
    default: 'Pone la prenda a esta persona',
  },

  getPromptParaPrenda: function(tipo) {
    const t = String(tipo || '').toLowerCase().trim();
    if (this.promptsPorTipo && this.promptsPorTipo[t]) {
      return this.promptsPorTipo[t];
    }
    if (t === 'anteojo' || t === 'anteojos' || t === 'lentes' || t === 'gafas') {
      return 'Pone los anteojos a esta persona';
    }
    if (t === 'gorra' || t === 'gorras') return 'Pone la gorra a esta persona';
    if (t === 'gorro' || t === 'gorros') return 'Pone el gorro a esta persona';
    if (t === 'remera' || t === 'remeras') return 'Pone la remera a esta persona';
    if (t === 'campera' || t === 'camperas') return 'Pone la campera a esta persona';
    if (t === 'buzo' || t === 'buzos') return 'Pone el buzo a esta persona';
    if (t === 'pantalon' || t === 'pantalones') return 'Pone el pantalón a esta persona';
    if (t) {
      const art = t.endsWith('a') ? 'la' : (t.endsWith('os') || t.endsWith('as') ? 'los' : 'el');
      return `Pone ${art} ${t} a esta persona`;
    }
    return this.promptsPorTipo?.default || 'Pone la prenda a esta persona';
  },

  // Mensajes de UI en español (es-AR)
  uiMessages: {
    loadingProduct: 'Cargando producto...',
    uploadingAndQueuing: 'Subiendo imagen y conectando con IA...',
    inQueue: 'En cola de procesamiento en fal.ai...',
    inProgress: 'Generando prueba y ajustando con IA...',
    downloadingResult: 'Descargando resultado final...',
    quotaExceeded: 'Esta tienda alcanzó su límite mensual de pruebas con IA.',
    generalError: 'No pudimos procesar la imagen con la IA.',
    fallbackNotice: 'No pudimos procesar tu foto con IA — mostrando tu foto original.',
  }
};

if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
