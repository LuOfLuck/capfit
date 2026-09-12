/**
 * js/features/admin/admin.js
 * Orquestador principal del Panel de Administración y Backoffice (<150 líneas).
 */

const AdminPanel = (() => {
  let _activeTab = 'catalogo';

  async function init() {
    const isLogged = window.AdminAuth ? AdminAuth.isLoggedIn() : false;
    const loginView = document.getElementById('admin-login-screen');
    const dashboardView = document.getElementById('admin-dashboard-screen');

    if (!isLogged) {
      if (loginView) loginView.style.display = 'block';
      if (dashboardView) dashboardView.style.display = 'none';
      return;
    }

    if (loginView) loginView.style.display = 'none';
    if (dashboardView) dashboardView.style.display = 'block';

    const session = AdminAuth.getSession();
    const storeLabel = document.getElementById('admin-current-store-name');
    if (storeLabel) storeLabel.textContent = `${session.storeName} (${session.subdomain}.capfit.store)`;

    // Cargar datos de la tienda activa
    if (window.AdminQuota) {
      const q = await AdminQuota.fetchQuota(session.storeId);
      AdminQuota.renderWidget('admin-quota-container', q);
    }

    switchTab(_activeTab);
  }

  async function switchTab(tabName) {
    _activeTab = tabName;
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.admin-tab-content').forEach(pane => {
      pane.style.display = pane.id === `admin-tab-${tabName}` ? 'block' : 'none';
    });

    const session = window.AdminAuth ? AdminAuth.getSession() : { storeId: 'principal' };

    if (tabName === 'catalogo') {
      if (window.AdminProducts) {
        const prods = await AdminProducts.fetchProducts(session.storeId);
        AdminProducts.renderTable('admin-products-table-container', prods);
      }
    } else if (tabName === 'pedidos') {
      if (window.AdminOrders) {
        const orders = await AdminOrders.fetchOrders(session.storeId);
        AdminOrders.renderTable('admin-orders-table-container', orders);
      }
    } else if (tabName === 'nuevo') {
      if (window.AdminProducts && !AdminProducts.getEditingProduct()) {
        AdminProducts.resetEditing();
      }
    }
  }

  function handleProductFormSubmit(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('prod-edit-id')?.value;
    const nombre = document.getElementById('prod-name')?.value;
    const precio = parseFloat(document.getElementById('prod-price')?.value || '0');
    const stock = parseInt(document.getElementById('prod-stock')?.value || '10', 10);
    const tipo = document.getElementById('prod-type')?.value || 'gorra';
    const imgPreview = document.getElementById('prod-img-preview')?.value || '';
    const imgFrontal = document.getElementById('prod-img-frontal')?.value || imgPreview;

    if (!nombre || !precio) {
      alert('Completá al menos el nombre y precio del producto.');
      return;
    }

    AdminProducts.saveProduct({ id, nombre, precio, stock, tipo, imgPreview, imgFrontal }).then(ok => {
      if (ok) switchTab('catalogo');
    });
  }

  return {
    init,
    switchTab,
    handleProductFormSubmit,
    getActiveTab: () => _activeTab
  };
})();

window.AdminPanel = AdminPanel;
