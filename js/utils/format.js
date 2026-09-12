/**
 * js/utils/format.js
 * Helpers de formateo de precios (es-AR), fechas y cadenas de texto.
 */

function formatPrecio(n) {
  const num = Number(n || 0);
  return '$' + num.toLocaleString('es-AR');
}

function formatFecha(timestamp) {
  if (!timestamp) return '';
  const d = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateString(str, max = 50) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

window.formatPrecio = formatPrecio;
window.formatPrice = formatPrecio;
window.formatFecha = formatFecha;
window.truncateString = truncateString;
