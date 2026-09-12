/**
 * js/features/admin/admin-quota.js
 * Visualización y consulta de cuota de IA por tienda (<120 líneas).
 */

const AdminQuota = (() => {
  let _quotaData = null;

  async function fetchQuota(storeId) {
    const sId = storeId || (window.AdminAuth ? AdminAuth.getSession().storeId : 'principal');
    try {
      const res = await fetch(`/api/store/current?store=${encodeURIComponent(sId)}`);
      if (res.ok) {
        const data = await res.json();
        _quotaData = data.aiQuota || null;
        return _quotaData;
      }
    } catch (e) {
      console.warn('[AdminQuota] Error fetching quota:', e);
    }
    return null;
  }

  function renderWidget(containerId, quota) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const q = quota || _quotaData || { used: 0, limit: 100, remaining: 100, month: '' };
    const pct = Math.min(100, Math.round((q.used / Math.max(1, q.limit)) * 100));
    const isWarning = pct >= 80;
    const isDanger = pct >= 95;
    const color = isDanger ? '#ef4444' : (isWarning ? '#f59e0b' : '#22c55e');

    el.innerHTML = `
      <div style="background:var(--color-bg-card, #ffffff);border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;">
            🤖 Cuota de Probador Virtual IA
          </span>
          <span style="font-size:0.85rem;font-weight:700;color:${color};">
            ${q.used} / ${q.limit} pruebas (${q.remaining} restantes)
          </span>
        </div>
        <div style="width:100%;height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};transition:width 0.3s ease;"></div>
        </div>
        ${isDanger ? `<p style="font-size:0.78rem;color:#ef4444;margin-top:6px;font-weight:600;">⚠️ Has alcanzado el límite mensual. Contactá a soporte para ampliar tu plan.</p>` : ''}
      </div>
    `;
  }

  return {
    fetchQuota,
    renderWidget,
    getQuota: () => _quotaData
  };
})();

window.AdminQuota = AdminQuota;
