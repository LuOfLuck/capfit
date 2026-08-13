// ── Lista de piropos ──
// Editá, agregá o quitá los que quieras
const PIROPOS = [
  'Con esa gorra te ves tan bien que hasta el sol te tiene envidia.',
  'Pará, pará... necesito un momento para procesar todo ese estilo.',
  'La gorra te queda genial, pero lo que la hace especial sos vos.',
  'Si el estilo fuese delito, ya estarías detenido.',
  'Con esa pinta, la gorra te eligió a vos y no al revés.',
  'No sé si es la gorra o tu energía, pero algo acá brilla demasiado.',
  'Dijeron que el estilo no se compra... claramente no te conocían.',
  'Esa gorra encontró a su dueño perfecto, y los dos lo saben.',
  'Mirarte con esa gorra es como ver arte en movimiento.',
  'Con ese look, hasta el espejo pide una foto.',
  'La gorra es un 10, vos un 11. Cuenta redonda.',
  'Eso que ves en el resultado no es una foto, es una obra maestra.',
  'La gorra te completa, pero honestamente ya eras suficiente.',
  'Si el estilo fuera música, vos serías la canción favorita de todos.',
  'Con esa gorra pasás de bien a inalcanzable en décimas de segundo.',
];

function showPiropo() {
  const idx  = Math.floor(Math.random() * PIROPOS.length);
  document.getElementById('piropo-text').textContent = PIROPOS[idx];
}