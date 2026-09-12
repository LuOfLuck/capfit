/**
 * js/features/admin/admin-orders.js
 * Gestión de pedidos, estados de pago y despacho (<200 líneas).
 */

const AdminOrders = (() => {
  let _orders = [];

  async function fetchOrders(storeId) {
    const sId = storeId || (window.AdminAuth ? AdminAuth.getSession().storeId : 'principal');
    const token = window.AdminAuth ? AdminAuth.getSession().token : '';
    try {
      const res = await fetch(`/api/orders?store=${encodeURIComponent(sId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        _orders = await res.json();
        return _orders;
      }
    } catch (e) {
      console.warn('[AdminOrders] Error fetching orders:', e);
    }
    return [];
  }

  async function updateOrderStatus(orderId, updates) {
    const sId = window.AdminAuth ? AdminAuth.getSession().storeId : 'principal';
    const token = window.AdminAuth ? AdminAuth.getSession().token : '';
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}?store=${encodeURIComponent(sId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        if (window.showToast) window.showToast('Estado de pedido actualizado');
        await fetchOrders(sId);
        return true;
      }
    } catch (e) {
      console.error('[AdminOrders] Error updating status:', e);
    }
    return false;
  }

  function renderTable(containerId, ordersList) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const list = ordersList || _orders;
    if (list.length === 0) {
      el.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#94a3b8;">No se encontraron pedidos registrados.</div>`;
      return;
    }

    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
        <thead>
          <tr style="border-bottom:1px solid #e2e8f0;text-align:left;color:#64748b;">
            <th style="padding:10px;">ID / Fecha</th>
            <th style="padding:10px;">Cliente</th>
            <th style="padding:10px;">Items</th>
            <th style="padding:10px;">Total</th>
            <th style="padding:10px;">Pago</th>
            <th style="padding:10px;">Envío</th>
            <th style="padding:10px;text-align:right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(o => `
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:10px;">
                <div style="font-weight:700;">#${o.id.slice(-6)}</div>
                <div style="font-size:0.75rem;color:#94a3b8;">${window.formatDate ? window.formatDate(o.createdAt) : o.createdAt}</div>
              </td>
              <td style="padding:10px;">
                <div>${o.customer?.name || o.customerName || 'Cliente'}</div>
                <div style="font-size:0.75rem;color:#94a3b8;">${o.customer?.email || ''}</div>
              </td>
              <td style="padding:10px;">${(o.items || []).length} prendas</td>
              <td style="padding:10px;font-weight:700;">${window.formatPrecio ? window.formatPrecio(o.total) : `$${o.total}`}</td>
              <td style="padding:10px;">
                <span style="display:inline-block;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600;background:${o.paymentStatus === 'approved' ? '#dcfce7' : '#fef3c7'};color:${o.paymentStatus === 'approved' ? '#166534' : '#92400e'}">
                  ${o.paymentStatus || 'pendiente'}
                </span>
              </td>
              <td style="padding:10px;">
                <select onchange="AdminOrders.updateOrderStatus('${o.id}', { shippingStatus: this.value })" style="padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;font-size:0.75rem;">
                  <option value="pendiente" ${o.shippingStatus === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                  <option value="empaquetado" ${o.shippingStatus === 'empaquetado' ? 'selected' : ''}>Empaquetado</option>
                  <option value="en_camino" ${o.shippingStatus === 'en_camino' ? 'selected' : ''}>En camino</option>
                  <option value="entregado" ${o.shippingStatus === 'entregado' ? 'selected' : ''}>Entregado</option>
                </select>
              </td>
              <td style="padding:10px;text-align:right;">
                <button onclick="AdminOrders.viewDetails('${o.id}')" style="padding:4px 10px;border-radius:6px;background:#f1f5f9;border:1px solid #e2e8f0;font-size:0.75rem;cursor:pointer;">Ver</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function viewDetails(orderId) {
    const o = _orders.find(item => item.id === orderId);
    if (!o) return;
    if (window.showCustomModal) {
      window.showCustomModal({
        title: `Pedido #${o.id.slice(-6)}`,
        message: `Cliente: ${o.customer?.name || 'N/A'}\nEmail: ${o.customer?.email || 'N/A'}\nTeléfono: ${o.customer?.phone || 'N/A'}\nDirección: ${o.shipping?.address || 'N/A'}\nTotal: $${o.total}\nItems:\n` + (o.items || []).map(i => `- ${i.nombre || i.title} x${i.quantity || 1}`).join('\n')
      });
    }
  }

  return {
    fetchOrders,
    updateOrderStatus,
    renderTable,
    viewDetails,
    getOrders: () => _orders
  };
})();

window.AdminOrders = AdminOrders;
