// ── Catálogo de gorras ──
let gorras      = [];
let gorraActiva = null;

async function cargarCatalogo() {
  try {
    const r = await fetch('gorras.json');
    gorras = await r.json();
    renderCatalogo();
    // Seleccionar primera por defecto sin hacer scroll
    gorraActiva = gorras[0];
    marcarActiva(gorras[0].id);
    actualizarPanelElegiste(gorras[0]);
    if (window.cargar3D) window.cargar3D(gorras[0].model3D);
  } catch (e) {
    console.error('Error cargando gorras.json:', e);
  }
}

function renderCatalogo() {
  const grid = document.getElementById('catalogo-grid');
  grid.innerHTML = gorras.map((g, i) => `
    <div class="cap-card" id="card-${g.id}" data-index="${i}">
      <div class="cap-card-img">
        <img src="${g.imgPreview}" alt="${g.nombre}" onerror="this.style.opacity='0.2'">
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

  // Eventos con event delegation — sin inline onclick
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.cap-card');
    if (!card) return;
    const idx = parseInt(card.dataset.index);
    seleccionarGorra(gorras[idx]);
  });
}

function seleccionarGorra(g) {
  gorraActiva = g;
  marcarActiva(g.id);
  actualizarPanelElegiste(g);
  if (window.cargar3D) window.cargar3D(g.model3D);
  // Scroll a cámara
  document.getElementById('try-section').scrollIntoView({ behavior: 'smooth' });
}

function marcarActiva(id) {
  document.querySelectorAll('.cap-card').forEach(c => c.classList.remove('activa'));
  const card = document.getElementById('card-' + id);
  if (card) card.classList.add('activa');
}

function actualizarPanelElegiste(g) {
  const img    = document.getElementById('elegiste-img');
  const nombre = document.getElementById('elegiste-nombre');
  const precio = document.getElementById('elegiste-precio');
  if (img)    img.src              = g.imgPreview;
  if (nombre) nombre.textContent   = g.nombre;
  if (precio) precio.textContent   = formatPrecio(g.precio);
}

function formatPrecio(n) {
  return '$' + n.toLocaleString('es-AR');
}

function cambiarModelo() {
  document.getElementById('catalogo-section').scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', cargarCatalogo);