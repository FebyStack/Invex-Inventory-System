// Batches — wired to /api/batches (GET)
// Backend response: { success, count, data: [...] }
//   each row: { id, batch_no, product_id, product_name, sku, location_id, location_name,
//               quantity, expiry_date, manufacture_date?, ... }

const tableBody     = document.getElementById('batches-table-body');
const loadingState  = document.getElementById('loading-state');
const emptyState    = document.getElementById('empty-state');
const searchInput   = document.getElementById('search-input');
const filterBar     = document.getElementById('batch-filters');

let cache = [];
let activeFilter = 'all';

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  } catch { return '—'; }
};

function statusOf(b) {
  if (!b.expiry_date) return 'active';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(b.expiry_date); exp.setHours(0, 0, 0, 0);
  const days  = Math.floor((exp - today) / 86400000);
  if (days < 0)  return 'expired';
  if (days < 90) return 'expiring';
  return 'active';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function loadBatches() {
  const token = sessionStorage.getItem('token');
  try {
    const res = await fetch('/api/batches', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      cache = data.data || [];
      render();
    } else if (loadingState) {
      loadingState.querySelector('td').textContent = data.message || 'Failed to load batches.';
    }
  } catch (err) {
    if (loadingState) loadingState.querySelector('td').textContent = 'Network error.';
  }
}

function render() {
  // Update filter counts
  const counts = { all: cache.length, active: 0, expiring: 0, expired: 0 };
  cache.forEach(b => { counts[statusOf(b)]++; });
  filterBar.querySelectorAll('.count-pill').forEach(el => {
    el.textContent = counts[el.dataset.c] ?? 0;
  });
  filterBar.querySelectorAll('button[data-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === activeFilter);
  });

  const q = searchInput.value.toLowerCase().trim();
  const filtered = cache.filter(b => {
    if (activeFilter !== 'all' && statusOf(b) !== activeFilter) return false;
    if (!q) return true;
    return (b.product_name || '').toLowerCase().includes(q) ||
           (b.sku || '').toLowerCase().includes(q) ||
           (b.batch_no || '').toLowerCase().includes(q);
  });

  tableBody.innerHTML = '';

  if (cache.length === 0) {
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  if (filtered.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="list-loading">No batches match the current filter.</td></tr>';
    return;
  }

  filtered.forEach(b => {
    const status = statusOf(b);
    const expColor = status === 'expired' ? 'var(--danger)'
                    : status === 'expiring' ? 'var(--warning)'
                    : 'var(--fg-3)';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono" style="font-size:11px;color:var(--fg-2);">${escapeHtml(b.batch_no || '—')}</td>
      <td>
        <div class="name">${escapeHtml(b.product_name || 'Unknown')}</div>
        <div class="sub">${escapeHtml(b.sku || '')}</div>
      </td>
      <td class="num">${escapeHtml(b.quantity ?? 0)}</td>
      <td class="muted">${fmtDate(b.manufacture_date || b.created_at)}</td>
      <td class="mono" style="font-size:12px;color:${expColor};">${fmtDate(b.expiry_date)}</td>
      <td class="mono" style="font-size:11px;color:var(--fg-3);">${escapeHtml(b.location_name ? b.location_name.slice(0, 6).toUpperCase() : '—')}</td>
      <td><span class="pill ${status === 'expired' ? 'danger' : status === 'expiring' ? 'warning' : 'success'}">${status.toUpperCase()}</span></td>
    `;
    tableBody.appendChild(tr);
  });
}

// ── Events ───────────────────────────────────
searchInput.oninput = render;
filterBar.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  activeFilter = btn.dataset.filter;
  render();
});

loadBatches();
