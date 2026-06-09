// ── Catálogo de gorras ──

// ── DOM refs (cacheados una sola vez) ──
const CatalogoUI = {
  get grid()         { return document.getElementById('catalogo-grid'); },
  // Desktop panel
  get elegImg()      { return document.getElementById('elegiste-img'); },
  get elegNombre()   { return document.getElementById('elegiste-nombre'); },
  get elegPrecio()   { return document.getElementById('elegiste-precio'); },
  // Mobile strip
  get stripImg()     { return document.getElementById('elegiste-strip-img'); },
  get stripEmoji()   { return document.getElementById('elegiste-strip-emoji'); },
  get stripNombre()  { return document.getElementById('elegiste-strip-nombre'); },
  get stripPrecio()  { return document.getElementById('elegiste-strip-precio'); },
};

// ── Helpers ──
function formatPrecio(n) {
  return '$' + n.toLocaleString('es-AR');
}

function cambiarModelo() {
  document.getElementById('catalogo-section').scrollIntoView({ behavior: 'smooth' });
}

// ── Render ──
function renderCatalogo(gorras) {
  const grid = CatalogoUI.grid;

  grid.innerHTML = gorras.map((g, i) => `
    <div class="cap-card" id="card-${g.id}" data-index="${i}">
      <div class="cap-card-img">
        <img src="${g.imgPreview}" alt="${g.nombre}"
          onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#ccc;font-size:2rem\\'>🧢</div>'">
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

  // Event delegation — un solo listener en el grid
  grid.addEventListener('click', e => {
    const card = e.target.closest('.cap-card');
    if (!card) return;
    const g = gorras[parseInt(card.dataset.index)];
    if (g) seleccionarGorra(g);
  });
}

// ── Selección ──
function marcarActiva(id) {
  document.querySelectorAll('.cap-card').forEach(c => c.classList.remove('activa'));
  document.getElementById('card-' + id)?.classList.add('activa');
}

function actualizarPanelElegiste(g) {
  const ui = CatalogoUI;

  // Panel lateral (desktop)
  if (ui.elegImg) {
    ui.elegImg.src          = g.imgPreview || '';
    ui.elegImg.style.display = 'block';
    ui.elegImg.onerror = () => {
      ui.elegImg.style.display = 'none';
      ui.elegImg.parentElement.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#ccc;font-size:3rem">🧢</div>';
    };
  }
  if (ui.elegNombre) ui.elegNombre.textContent = g.nombre;
  if (ui.elegPrecio) ui.elegPrecio.textContent  = formatPrecio(g.precio);

  // Strip mobile
  const hasImg = !!g.imgPreview;
  if (ui.stripImg) {
    ui.stripImg.src          = g.imgPreview || '';
    ui.stripImg.style.display = hasImg ? 'block' : 'none';
  }
  if (ui.stripEmoji)  ui.stripEmoji.style.display  = hasImg ? 'none' : 'flex';
  if (ui.stripNombre) ui.stripNombre.textContent    = g.nombre;
  if (ui.stripPrecio) ui.stripPrecio.textContent    = formatPrecio(g.precio);
}

function seleccionarGorra(g) {
  Store.setGorraActiva(g);
  window.gorraActiva = g;
  marcarActiva(g.id);
  actualizarPanelElegiste(g);
  if (window.cargar3D) window.cargar3D(g.model3D);
  document.getElementById('try-section').scrollIntoView({ behavior: 'smooth' });
}

// ── Init ──
async function cargarCatalogo() {
  try {
    const r = await fetch('gorras.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const gorras = await r.json();

    Store.setGorras(gorras);

    renderCatalogo(gorras);

    // Seleccionar primera por defecto (sin scroll)
    const primera = gorras[0];
    Store.setGorraActiva(primera);
    marcarActiva(primera.id);
    actualizarPanelElegiste(primera);
    if (window.cargar3D) window.cargar3D(primera.model3D);

  } catch (e) {
    console.error('[Catalogo] Error cargando gorras.json:', e);
    CatalogoUI.grid.innerHTML =
      '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#c00;font-size:.82rem">Error cargando el catálogo. Recargá la página.</div>';
  }
}

window.addEventListener('DOMContentLoaded', cargarCatalogo);