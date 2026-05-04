// Orders — wired to /api/orders, /api/products, /api/locations
// Backend response: { success, data: [{ id, order_type, reference_no, order_date,
//                       source_location_name, destination_location_name, item_count, notes }] }

const tableBody    = document.getElementById('orders-table-body');
const loadingState = document.getElementById('loading-state');
const emptyState   = document.getElementById('empty-state');
const tabBar       = document.getElementById('order-tabs');
const modal        = document.getElementById('order-modal');
const form         = document.getElementById('order-form');
const itemsList    = document.getElementById('items-list');

const typeSelect  = document.getElementById('order_type');
const sourceGroup = document.getElementById('source-loc-group');
const destGroup   = document.getElementById('dest-loc-group');

let ordersCache = [];
let productsCache = [];
let locationsCache = [];
let activeTab = 'all';

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  } catch { return '—'; }
};
const fmtPHP = (n) => '₱' + (Number(n || 0)).toLocaleString();
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function loadOrders() {
  const token = sessionStorage.getItem('token');
  try {
    const res = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      ordersCache = data.data || [];
      render();
    } else if (loadingState) {
      loadingState.querySelector('td').textContent = data.message || 'Failed to load orders.';
    }
  } catch {
    if (loadingState) loadingState.querySelector('td').textContent = 'Network error.';
  }
}

function render() {
  // Tab counts
  const counts = { all: ordersCache.length, IN: 0, OUT: 0, TRANSFER: 0 };
  ordersCache.forEach(o => { counts[o.order_type] = (counts[o.order_type] || 0) + 1; });
  tabBar.querySelectorAll('.count-pill').forEach(el => { el.textContent = counts[el.dataset.c] ?? 0; });
  tabBar.querySelectorAll('button[data-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });

  const filtered = activeTab === 'all'
    ? ordersCache
    : ordersCache.filter(o => o.order_type === activeTab);

  tableBody.innerHTML = '';

  if (ordersCache.length === 0) {
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  if (filtered.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="list-loading">No orders match this tab.</td></tr>';
    return;
  }

  filtered.forEach(o => {
    const typeLabel  = o.order_type === 'IN' ? 'IN' : o.order_type === 'OUT' ? 'OUT' : 'XFER';
    const typeKlass  = o.order_type === 'IN' ? 'success' : o.order_type === 'OUT' ? 'info' : 'warning';
    const path       = o.order_type === 'IN'  ? `→ ${escapeHtml(o.destination_location_name || '—')}`
                     : o.order_type === 'OUT' ? `${escapeHtml(o.source_location_name || '—')} →`
                                              : `${escapeHtml(o.source_location_name || '—')} → ${escapeHtml(o.destination_location_name || '—')}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono" style="font-size:11px;color:var(--fg-1);font-weight:500;">ORD-${String(o.id).padStart(5, '0')}</td>
      <td><span class="pill ${typeKlass}">${typeLabel}</span></td>
      <td class="mono" style="font-size:12px;color:var(--fg-3);">${escapeHtml(o.reference_no || '—')}</td>
      <td style="color:var(--fg-1);">${path}</td>
      <td class="num">${o.item_count ?? 0}</td>
      <td class="muted">${fmtDate(o.order_date || o.created_at)}</td>
      <td><span class="pill success">COMPLETED</span></td>
    `;
    tableBody.appendChild(tr);
  });
}

// ── Tabs ─────────────────────────────────
tabBar.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  render();
});

// ── Modal data ────────────────────────────
async function loadCache() {
  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };
  const [pRes, lRes] = await Promise.all([
    fetch('/api/products',  { headers }),
    fetch('/api/locations', { headers }),
  ]);
  productsCache  = (await pRes.json()).data || [];
  locationsCache = (await lRes.json()).data || [];

  const sourceSel = document.getElementById('source_location_id');
  const destSel   = document.getElementById('destination_location_id');
  sourceSel.innerHTML = '<option value="">Select source…</option>';
  destSel.innerHTML   = '<option value="">Select destination…</option>';
  locationsCache.forEach(l => {
    sourceSel.add(new Option(l.name, l.id));
    destSel.add(new Option(l.name, l.id));
  });
}

typeSelect.onchange = () => {
  const v = typeSelect.value;
  sourceGroup.style.display = (v === 'OUT' || v === 'TRANSFER') ? 'block' : 'none';
  destGroup.style.display   = (v === 'IN'  || v === 'TRANSFER') ? 'block' : 'none';
};

function addItemRow() {
  const div = document.createElement('div');
  div.className = 'item-row';
  div.innerHTML = `
    <div class="form-group">
      <label>Product</label>
      <select class="form-control product-select" required>
        <option value="">Select…</option>
        ${productsCache.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku)})</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Qty</label>
      <input type="number" class="form-control qty-input" required min="1">
    </div>
    <div class="form-group">
      <label>Price (₱)</label>
      <input type="number" class="form-control price-input" required step="0.01" min="0">
    </div>
    <div class="form-group">
      <label>&nbsp;</label>
      <button type="button" class="btn btn-ghost btn-sm remove-btn">✕</button>
    </div>
  `;
  div.querySelector('.remove-btn').onclick = () => div.remove();
  itemsList.appendChild(div);
}

document.getElementById('new-order-btn').onclick = () => {
  form.reset();
  itemsList.innerHTML = '';
  addItemRow();
  typeSelect.onchange();
  modal.style.display = 'flex';
};
document.getElementById('add-item-btn').onclick = addItemRow;
document.getElementById('cancel-btn').onclick = () => modal.style.display = 'none';
modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  const items = Array.from(document.querySelectorAll('.item-row')).map(row => ({
    product_id: parseInt(row.querySelector('.product-select').value, 10),
    quantity:   parseInt(row.querySelector('.qty-input').value, 10),
    unit_price: parseFloat(row.querySelector('.price-input').value),
  }));

  const payload = {
    order_type: typeSelect.value,
    reference_no: document.getElementById('reference_no').value || null,
    source_location_id: parseInt(document.getElementById('source_location_id').value, 10) || null,
    destination_location_id: parseInt(document.getElementById('destination_location_id').value, 10) || null,
    notes: document.getElementById('notes').value || null,
    items,
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) { modal.style.display = 'none'; loadOrders(); }
    else alert(result.message || 'Failed to create order.');
  } catch { alert('Network error.'); }
};

loadCache().then(loadOrders);
