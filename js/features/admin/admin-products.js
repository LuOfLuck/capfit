/**
 * js/features/admin/admin-products.js
 * CRUD de productos del catálogo para la tienda activa (<250 líneas).
 */

const AdminProducts = (() => {
  let _products = [];
  let _editingProduct = null;

  async function fetchProducts(storeId) {
    const sId = storeId || (window.AdminAuth ? AdminAuth.getSession().storeId : 'principal');
    try {
      const res = await fetch(`/api/gorras?store=${encodeURIComponent(sId)}`);
      if (res.ok) {
        _products = await res.json();
        return _products;
      }
    } catch (e) {
      console.warn('[AdminProducts] Error fetching products:', e);
    }
    return [];
  }

  async function saveProduct(formData) {
    const sId = window.AdminAuth ? AdminAuth.getSession().storeId : 'principal';
    const token = window.AdminAuth ? AdminAuth.getSession().token : '';
    const isEdit = !!formData.id;
    const url = isEdit
      ? `/api/gorras/${encodeURIComponent(formData.id)}?store=${encodeURIComponent(sId)}`
      : `/api/gorras?store=${encodeURIComponent(sId)}`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...formData, storeId: sId })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al guardar el producto');
      }

      if (window.showToast) window.showToast(`Producto ${isEdit ? 'actualizado' : 'creado'} con éxito`);
      await fetchProducts(sId);
      if (window.Store && Store.setGorras) Store.setGorras(_products);
      _editingProduct = null;
      return true;
    } catch (e) {
      alert(e.message);
      return false;
    }
  }

  async function deleteProduct(productId) {
    if (!confirm('¿Estás seguro de que deseás eliminar este producto?')) return false;
    const sId = window.AdminAuth ? AdminAuth.getSession().storeId : 'principal';
    const token = window.AdminAuth ? AdminAuth.getSession().token : '';

    try {
      const res = await fetch(`/api/gorras/${encodeURIComponent(productId)}?store=${encodeURIComponent(sId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        if (window.showToast) window.showToast('Producto eliminado');
        await fetchProducts(sId);
        if (window.Store && Store.setGorras) Store.setGorras(_products);
        return true;
      }
    } catch (e) {
      console.error('[AdminProducts] Error deleting:', e);
    }
    return false;
  }

  function renderTable(containerId, list) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const items = list || _products;
    if (items.length === 0) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#94a3b8;">No hay productos cargados en esta tienda.</div>`;
      return;
    }

    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
        <thead>
          <tr style="border-bottom:1px solid #e2e8f0;text-align:left;color:#64748b;">
            <th style="padding:10px;">Imagen</th>
            <th style="padding:10px;">Nombre / Tipo</th>
            <th style="padding:10px;">Precio</th>
            <th style="padding:10px;">Stock</th>
            <th style="padding:10px;">Badge</th>
            <th style="padding:10px;text-align:right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(p => `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:8px 10px;">
                <img src="${p.imgPreview}" alt="${p.nombre}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;border:1px solid #e2e8f0;">
              </td>
              <td style="padding:8px 10px;">
                <div style="font-weight:700;">${p.nombre}</div>
                <div style="font-size:0.75rem;color:#94a3b8;">${p.tipo || 'gorra'} · ${p.marca || 'CapFit'}</div>
              </td>
              <td style="padding:8px 10px;font-weight:700;">${window.formatPrecio ? window.formatPrecio(p.precio) : `$${p.precio}`}</td>
              <td style="padding:8px 10px;">
                <span style="font-weight:600;color:${(p.stock || 0) <= 2 ? '#ef4444' : '#166534'}">${p.stock || 0} un.</span>
              </td>
              <td style="padding:8px 10px;">
                ${p.badge ? `<span style="background:#f1f5f9;padding:3px 8px;border-radius:10px;font-size:0.7rem;font-weight:600;">${p.badge}</span>` : '-'}
              </td>
              <td style="padding:8px 10px;text-align:right;">
                <button onclick="AdminProducts.editProduct('${p.id}')" style="padding:4px 8px;border-radius:6px;background:#f8fafc;border:1px solid #cbd5e1;cursor:pointer;margin-right:4px;">✏️</button>
                <button onclick="AdminProducts.deleteProduct('${p.id}')" style="padding:4px 8px;border-radius:6px;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;cursor:pointer;">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function editProduct(productId) {
    const p = _products.find(item => item.id === productId);
    if (!p) return;
    _editingProduct = p;
    if (window.AdminPanel && AdminPanel.switchTab) {
      AdminPanel.switchTab('nuevo');
      fillForm(p);
    }
  }

  function fillForm(p) {
    const idEl = document.getElementById('prod-edit-id');
    const nameEl = document.getElementById('prod-name');
    const priceEl = document.getElementById('prod-price');
    const stockEl = document.getElementById('prod-stock');
    const typeEl = document.getElementById('prod-type');
    const imgPreviewEl = document.getElementById('prod-img-preview');
    const imgFrontalEl = document.getElementById('prod-img-frontal');

    if (idEl) idEl.value = p ? p.id : '';
    if (nameEl) nameEl.value = p ? p.nombre : '';
    if (priceEl) priceEl.value = p ? p.precio : '';
    if (stockEl) stockEl.value = p ? p.stock : 10;
    if (typeEl) typeEl.value = p ? (p.tipo || 'gorra') : 'gorra';
    if (imgPreviewEl) imgPreviewEl.value = p ? p.imgPreview : '';
    if (imgFrontalEl) imgFrontalEl.value = p ? p.imgFrontal : '';
  }

  return {
    fetchProducts,
    saveProduct,
    deleteProduct,
    renderTable,
    editProduct,
    fillForm,
    getProducts: () => _products,
    getEditingProduct: () => _editingProduct,
    resetEditing: () => { _editingProduct = null; fillForm(null); }
  };
})();

window.AdminProducts = AdminProducts;
