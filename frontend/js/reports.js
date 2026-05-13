/**
 * reports.js
 * Handles tabs: Low Stock, Expiring Soon, Stock Summary, Movement Log.
 * Each tab fetches from the reports API and supports export.
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  // Tab switching
  function activateTab(name) {
    const btn = document.querySelector(`.tab-btn[data-tab="${name}"]`);
    const panel = document.getElementById('tab-' + name);
    if (!btn || !panel) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    panel.classList.add('active');
  }
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
  // Honor a URL hash like #expiring or #low-stock so notification deep
  // links open straight to the relevant tab.
  const initialHash = (location.hash || '').replace(/^#/, '');
  if (initialHash) activateTab(initialHash);
  window.addEventListener('hashchange', () => {
    const h = (location.hash || '').replace(/^#/, '');
    if (h) activateTab(h);
  });

  const locationFilter = document.getElementById('report-location-filter');

  async function loadLocations() {
    try {
      const res = await fetch('/api/locations', { headers });
      const data = await res.json();
      if (data.success) {
        data.data.forEach(loc => {
          const opt = new Option(loc.name, loc.id);
          locationFilter.add(opt);
        });
      }
    } catch (err) {
      console.error('Failed to load locations for filter:', err);
    }
  }

  // ── Low Stock ──
  async function loadLowStock() {
    const locId = locationFilter.value;
    try {
      let url = '/api/reports/low-stock';
      if (locId) url += `?location_id=${locId}`;
      const res = await fetch(url, { headers });
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
              <div style="font-weight:500;color:var(--fg-1)">${escapeHtml(item.product_name)}</div>
              <div style="font-size:11px;color:var(--fg-4);font-family:'DM Mono',monospace">${escapeHtml(item.sku)}</div>
            </td>
            <td style="text-align:right;font-family:'DM Mono',monospace;color:${isOut ? 'var(--danger)' : 'var(--warning)'}">${Number(item.current_stock) || 0}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace;color:var(--fg-3)">${Number(item.reorder_level) || 0}</td>
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
    const locId = locationFilter.value;

    loading.style.display = 'block';
    empty.style.display = 'none';
    tbody.innerHTML = '';

    try {
      let url = `/api/reports/expiring?days=${days}`;
      if (locId) url += `&location_id=${locId}`;
      const res = await fetch(url, { headers });
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
              <div style="font-weight:500;color:var(--fg-1)">${escapeHtml(item.product_name)}</div>
              <div style="font-size:11px;color:var(--fg-4);font-family:'DM Mono',monospace">${escapeHtml(item.sku)}</div>
            </td>
            <td style="font-family:'DM Mono',monospace;color:var(--fg-2)">${escapeHtml(item.batch_no || '-')}</td>
            <td style="color:var(--fg-2)">${escapeHtml(item.location_name)}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace">${Number(item.quantity) || 0}</td>
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
            <td style="font-weight:500;color:var(--fg-1)">${escapeHtml(loc.location_name)}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace">${Number(loc.total_unique_products) || 0}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace">${parseInt(loc.total_items).toLocaleString()}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace">₱${parseFloat(loc.total_value).toLocaleString('en',{minimumFractionDigits:2})}</td>
            <td style="text-align:right">
              <button class="export-btn" style="padding:2px 8px;font-size:10px;" onclick="exportReport('stock-report','xlsx',${loc.location_id})">⬇ XLSX</button>
            </td>
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
    const locId = locationFilter.value;
    try {
      let url = '/api/reports/movement-log?limit=200';
      if (locId) url += `&location_id=${locId}`;
      const res = await fetch(url, { headers });
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
              <div style="font-weight:500;color:var(--fg-1)">${escapeHtml(m.product_name)}</div>
              <div style="font-size:11px;color:var(--fg-4);font-family:'DM Mono',monospace">${escapeHtml(m.sku)}</div>
            </td>
            <td style="color:var(--fg-2)">${escapeHtml(m.location_name)}</td>
            <td style="text-align:right;font-family:'DM Mono',monospace;color:${isPositive?'var(--success)':'var(--danger)'}">${isPositive?'+':''}${Number(m.quantity_change) || 0}</td>
            <td><span class="status-badge ${isPositive?'status-in-stock':'status-out-of-stock'}">${escapeHtml(m.source_type || '-')}</span></td>
            <td style="color:var(--fg-3)">${escapeHtml(m.performed_by || '-')}</td>
            <td style="color:var(--fg-4);font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(m.notes || '-')}</td>
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

  function refreshAll() {
    loadLowStock();
    loadExpiring(document.getElementById('expiry-days').value);
    loadMovementLog();
    // Stock Summary stays global-ish or reflects the single location row
    loadStockSummary();
  }

  // Load initial data
  loadLocations();
  refreshAll();

  locationFilter.addEventListener('change', refreshAll);

  // Export helper (globally accessible)
  window.exportReport = function (type, format, locationIdOverride) {
    const locId = locationIdOverride || locationFilter.value;
    let url = `/api/export/${type}?format=${format}`;
    if (locId) url += `&location_id=${locId}`;
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';

    // Use fetch with auth header to download
    fetch(url, { headers })
      .then(res => {
        if (!res.ok) {
          alert('Export failed — the server returned an error.');
          throw new Error('Export failed');
        }
        const disposition = res.headers.get('Content-Disposition');
        let filename = `${type}.${format}`;
        if (disposition && disposition.indexOf('attachment') !== -1) {
          const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
          const matches = filenameRegex.exec(disposition);
          if (matches != null && matches[1]) {
            filename = matches[1].replace(/['"]/g, '');
          }
        }
        return res.blob().then(blob => ({ blob, filename }));
      })
      .then(({ blob, filename }) => {
        if (blob.size === 0) {
          alert('No data to export for this location.');
          return;
        }
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(objUrl);
        a.remove();
      })
      .catch(err => console.error('Export error:', err));
  };
})();
