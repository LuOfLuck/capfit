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
        <img src="${g.imgPreview}" alt="${g.nombre}"
          onerror="this.src='';this.style.display='none';this.parentElement.innerHTML='<div style=\'display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#ccc;font-size:2rem\'}>🧢</div>'">
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
  // Panel lateral (desktop)
  const img    = document.getElementById('elegiste-img');
  const nombre = document.getElementById('elegiste-nombre');
  const precio = document.getElementById('elegiste-precio');
  if (img) {
    img.src = g.imgPreview || '';
    img.style.display = 'block';
    img.onerror = () => {
      img.style.display = 'none';
      img.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#ccc;font-size:3rem">🧢</div>';
    };
  }
  if (nombre) nombre.textContent = g.nombre;
  if (precio) precio.textContent = formatPrecio(g.precio);

  // Strip mobile
  const stripImg    = document.getElementById('elegiste-strip-img');
  const stripEmoji  = document.getElementById('elegiste-strip-emoji');
  const stripNombre = document.getElementById('elegiste-strip-nombre');
  const stripPrecio = document.getElementById('elegiste-strip-precio');
  if (stripImg) {
    stripImg.style.display = 'block';
    stripImg.src = g.imgPreview || '';
    if (stripEmoji) stripEmoji.style.display = 'none';
    if (!g.imgPreview) {
      stripImg.style.display = 'none';
      if (stripEmoji) stripEmoji.style.display = 'flex';
    }
  }
  if (stripNombre) stripNombre.textContent = g.nombre;
  if (stripPrecio) stripPrecio.textContent = formatPrecio(g.precio);
}

function formatPrecio(n) {
  return '$' + n.toLocaleString('es-AR');
}

function cambiarModelo() {
  document.getElementById('catalogo-section').scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', cargarCatalogo);