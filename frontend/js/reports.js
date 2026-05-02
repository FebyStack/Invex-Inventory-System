/**
 * reports.js
 * Handles tabs: Low Stock, Expiring Soon, Stock Summary, Movement Log.
 * Each tab fetches from the reports API and supports export.
 */
(function () {
  'use strict';

  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── Low Stock ──
  async function loadLowStock() {
    try {
      const res = await fetch('/api/reports/low-stock', { headers });
      const data = await res.json();
      document.getElementById('low-stock-loading').style.display = 'none';

      if (data.success && data.data.length > 0) {
        const tbody = document.getElementById('low-stock-body');
        tbody.innerHTML = '';
        data.data.forEach(item => {
          const isOut = item.current_stock === 0;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div style="font-weight:500;color:var(--fg-1)">${item.product_name}</div>
              <div style="font-size:11px;color:var(--fg-4);font-family:'DM Mono',monospace">${item.sku}</div>
            </td>
            <td style="color:var(--fg-2)">${item.location_name}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace;color:${isOut ? 'var(--danger)' : 'var(--warning)'}">${item.current_stock}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace;color:var(--fg-3)">${item.reorder_level}</td>
            <td>${isOut ? '<span class="badge-out">OUT OF STOCK</span>' : '<span class="badge-low">LOW STOCK</span>'}</td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        document.getElementById('low-stock-empty').style.display = 'block';
      }
    } catch (err) {
      console.error('Low stock error:', err);
      document.getElementById('low-stock-loading').textContent = 'Failed to load.';
    }
  }

  // ── Expiring Soon ──
  async function loadExpiring(days) {
    const tbody = document.getElementById('expiring-body');
    const loading = document.getElementById('expiring-loading');
    const empty = document.getElementById('expiring-empty');

    loading.style.display = 'block';
    empty.style.display = 'none';
    tbody.innerHTML = '';

    try {
      const res = await fetch(`/api/reports/expiring?days=${days}`, { headers });
      const data = await res.json();
      loading.style.display = 'none';

      if (data.success && data.data.length > 0) {
        data.data.forEach(item => {
          const daysLeft = item.days_until_expiry;
          const isExpired = daysLeft < 0;
          let statusBadge;
          if (isExpired) statusBadge = '<span class="badge-expired">EXPIRED</span>';
          else if (daysLeft <= 7) statusBadge = '<span class="badge-expired">CRITICAL</span>';
          else if (daysLeft <= 30) statusBadge = '<span class="badge-soon">EXPIRING SOON</span>';
          else statusBadge = '<span class="badge-ok">OK</span>';

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div style="font-weight:500;color:var(--fg-1)">${item.product_name}</div>
              <div style="font-size:11px;color:var(--fg-4);font-family:'DM Mono',monospace">${item.sku}</div>
            </td>
            <td style="font-family:'DM Mono',monospace;color:var(--fg-2)">${item.batch_no || '-'}</td>
            <td style="color:var(--fg-2)">${item.location_name}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace">${item.quantity}</td>
            <td style="color:var(--fg-2)">${new Date(item.expiry_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
            <td>${statusBadge}</td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        empty.style.display = 'block';
      }
    } catch (err) {
      console.error('Expiring error:', err);
      loading.textContent = 'Failed to load.';
    }
  }

  document.getElementById('expiry-days').addEventListener('change', function () {
    loadExpiring(this.value);
  });

  // ── Stock Summary ──
  async function loadStockSummary() {
    try {
      const res = await fetch('/api/reports/stock-summary', { headers });
      const data = await res.json();
      document.getElementById('summary-loading').style.display = 'none';

      if (data.success && data.data.length > 0) {
        // Stats
        const totalProducts = data.data.reduce((s, r) => s + parseInt(r.total_unique_products || 0), 0);
        const totalItems = data.data.reduce((s, r) => s + parseInt(r.total_items || 0), 0);
        const totalValue = data.data.reduce((s, r) => s + parseFloat(r.total_value || 0), 0);

        document.getElementById('summary-stats').innerHTML = `
          <div class="stat-card"><div class="label">Locations</div><div class="value">${data.data.length}</div></div>
          <div class="stat-card"><div class="label">Total Items</div><div class="value">${totalItems.toLocaleString()}</div></div>
          <div class="stat-card"><div class="label">Total Value</div><div class="value">₱${totalValue.toLocaleString('en',{minimumFractionDigits:2})}</div></div>
        `;

        const tbody = document.getElementById('stock-summary-body');
        tbody.innerHTML = '';
        data.data.forEach(loc => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:500;color:var(--fg-1)">${loc.location_name}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace">${loc.total_unique_products}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace">${parseInt(loc.total_items).toLocaleString()}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace">₱${parseFloat(loc.total_value).toLocaleString('en',{minimumFractionDigits:2})}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    } catch (err) {
      console.error('Stock summary error:', err);
      document.getElementById('summary-loading').textContent = 'Failed to load.';
    }
  }

  // ── Movement Log ──
  async function loadMovementLog() {
    try {
      const res = await fetch('/api/reports/movement-log?limit=200', { headers });
      const data = await res.json();
      document.getElementById('movement-loading').style.display = 'none';

      if (data.success && data.data.length > 0) {
        const tbody = document.getElementById('movement-log-body');
        tbody.innerHTML = '';
        data.data.forEach(m => {
          const date = new Date(m.movement_date);
          const isPositive = m.quantity_change > 0;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="color:var(--fg-3);white-space:nowrap">${date.toLocaleDateString('en-US',{month:'short',day:'numeric'})} ${date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
            <td>
              <div style="font-weight:500;color:var(--fg-1)">${m.product_name}</div>
              <div style="font-size:11px;color:var(--fg-4);font-family:'DM Mono',monospace">${m.sku}</div>
            </td>
            <td style="color:var(--fg-2)">${m.location_name}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace;color:${isPositive?'var(--success)':'var(--danger)'}">${isPositive?'+':''}${m.quantity_change}</td>
            <td><span class="status-badge ${isPositive?'status-in-stock':'status-out-of-stock'}">${m.source_type || '-'}</span></td>
            <td style="color:var(--fg-3)">${m.performed_by || '-'}</td>
            <td style="color:var(--fg-4);font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.notes || '-'}</td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        document.getElementById('movement-empty').style.display = 'block';
      }
    } catch (err) {
      console.error('Movement log error:', err);
      document.getElementById('movement-loading').textContent = 'Failed to load.';
    }
  }

  // Load all tabs
  loadLowStock();
  loadExpiring(30);
  loadStockSummary();
  loadMovementLog();

  // Export helper (globally accessible)
  window.exportReport = function (type, format) {
    const url = `/api/export/${type}?format=${format}`;
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';

    // Use fetch with auth header to download
    fetch(url, { headers })
      .then(res => res.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.download = `${type}.${format}`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(objUrl);
        a.remove();
      })
      .catch(err => console.error('Export error:', err));
  };
})();
