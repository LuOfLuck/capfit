// ── Catálogo de gorras ──
// Lee gorras.json, renderiza las cards y maneja la selección

let gorras       = [];       // datos del JSON
let gorraActiva  = null;     // gorra seleccionada actualmente

async function cargarCatalogo() {
  try {
    const r = await fetch('gorras.json');
    gorras = await r.json();
    renderCatalogo();
    seleccionarGorra(gorras[0]); // selecciona la primera por defecto
  } catch (e) {
    console.error('Error cargando gorras.json:', e);
  }
}

function renderCatalogo() {
  const grid = document.getElementById('catalogo-grid');
  grid.innerHTML = gorras.map(g => `
    <div class="cap-card" id="card-${g.id}" onclick="seleccionarGorra(${JSON.stringify(g).replace(/"/g, '&quot;')})">
      <div class="cap-card-img">
        <img src="${g.imgPreview}" alt="${g.nombre}" onerror="this.style.opacity='0.3'">
      </div>
      <div class="cap-card-colores">
        ${g.colores.map(c => `<span class="color-dot" style="background:${c}"></span>`).join('')}
      </div>
      <div class="cap-card-info">
        <p class="cap-card-nombre">${g.nombre}</p>
        <p class="cap-card-precio">${formatPrecio(g.precio)}</p>
      </div>
      <button class="cap-card-btn">Probar ahora</button>
    </div>
  `).join('');
}

function seleccionarGorra(g) {
  gorraActiva = g;

  // Marcar card activa
  document.querySelectorAll('.cap-card').forEach(c => c.classList.remove('activa'));
  const card = document.getElementById('card-' + g.id);
  if (card) card.classList.add('activa');

  // Actualizar panel "elegiste" en sección cámara
  document.getElementById('elegiste-img').src       = g.imgPreview;
  document.getElementById('elegiste-nombre').textContent = g.nombre;
  document.getElementById('elegiste-precio').textContent = formatPrecio(g.precio);

  // Actualizar 3D si está cargado
  if (window.cargar3D) window.cargar3D(g.model3D);

  // Scroll a sección probar
  document.getElementById('try-section').scrollIntoView({ behavior: 'smooth' });
}

function formatPrecio(n) {
  return '$' + n.toLocaleString('es-AR');
}

// Exponer para el botón "cambiar modelo"
function cambiarModelo() {
  document.getElementById('catalogo-section').scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', cargarCatalogo);