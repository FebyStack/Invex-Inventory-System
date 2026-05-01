// ============================================
// Locations page — multi-location inventory
// ============================================

const state = {
  activeLoc: 'all',
  locations: [],   // raw locations from /api/locations
  summary: null,   // { global, locations: [...] } from /api/locations/summary
  products: [],    // raw products from /api/products
  matrix: [],      // products with by_location stock map
};

const SWATCHES = ['#7C7CFF', '#5EEAD4', '#FBBF24', '#F472B6', '#A78BFA', '#F87171', '#4ADE80', '#60A5FA'];
const FALLBACK_DOTS = ['#7C7CFF', '#F472B6', '#FBBF24', '#A78BFA', '#F87171', '#5EEAD4', '#4ADE80', '#60A5FA'];

const token = sessionStorage.getItem('token');
const authHeaders = { 'Authorization': `Bearer ${token}` };

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString();
const fmtMoney = (n) => '₱' + fmt(Math.round(Number(n) || 0));
const locationCodeBase = (name) => {
  const words = String(name || '').trim().toUpperCase().match(/[A-Z0-9]+/g) || [];
  if (words.length > 1) return words.map((word) => word[0]).join('').slice(0, 6);
  return (words[0] || '').slice(0, 6);
};
const locationCodeFromName = (name) => {
  const base = locationCodeBase(name);
  if (!base) return '';

  const usedNumbers = state.locations
    .map((loc) => String(loc.code || '').match(new RegExp(`^${base}-(\\d+)$`)))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;
  return `${base}-${String(next).padStart(2, '0')}`;
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dotFor(loc, fallbackIdx) {
  return loc.color || FALLBACK_DOTS[fallbackIdx % FALLBACK_DOTS.length];
}

// ── Initial load ────────────────────────────────────────
async function load() {
  try {
    const [locRes, sumRes, matRes, prodRes] = await Promise.all([
      fetch('/api/locations', { headers: authHeaders }),
      fetch('/api/locations/summary', { headers: authHeaders }),
      fetch('/api/locations/inventory-matrix', { headers: authHeaders }),
      fetch('/api/products', { headers: authHeaders }),
    ]);
    const [locData, sumData, matData, prodData] = await Promise.all(
      [locRes, sumRes, matRes, prodRes].map((r) => r.json())
    );
    if (locData.success) state.locations = locData.data;
    if (sumData.success) state.summary = sumData.data;
    if (matData.success) state.matrix = matData.data;
    if (prodData.success) state.products = prodData.data;

    renderSelector();
    renderActive();
  } catch (err) {
    console.error('load failed', err);
    $('loc-selector').innerHTML = '<div class="empty-state">Failed to load locations.</div>';
  }
}

// ── Selector chips ──────────────────────────────────────
function renderSelector() {
  const sel = $('loc-selector');
  sel.innerHTML = '';

  const all = state.summary
    ? state.summary.global
    : { id: 'all', name: 'All locations', code: 'GLOBAL', color: '#5EEAD4' };
  sel.appendChild(chipFor(all, 0));

  const list = state.summary ? state.summary.locations : state.locations;
  list.forEach((loc, i) => sel.appendChild(chipFor(loc, i + 1)));

  const addBtn = document.createElement('button');
  addBtn.className = 'loc-chip add';
  addBtn.type = 'button';
  addBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    New location`;
  addBtn.onclick = openAddLocation;
  sel.appendChild(addBtn);

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  sel.appendChild(spacer);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-sm';
  importBtn.type = 'button';
  importBtn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    Import stock`;
  importBtn.onclick = () => openImportStock();
  sel.appendChild(importBtn);
}

function chipFor(loc, idx) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'loc-chip' + (state.activeLoc === loc.id ? ' active' : '');
  btn.onclick = () => { state.activeLoc = loc.id; renderSelector(); renderActive(); };
  const dot = dotFor(loc, idx);
  btn.innerHTML = `
    <span class="dot" style="background:${dot}"></span>
    ${escapeHtml(loc.name)}
    <span class="code">${escapeHtml(loc.code)}</span>`;
  return btn;
}

// ── Active view (headline + stats + body) ───────────────
function renderActive() {
  if (!state.summary) return;
  const isAll = state.activeLoc === 'all';
  const loc = isAll
    ? state.summary.global
    : state.summary.locations.find((l) => String(l.id) === String(state.activeLoc)) || state.summary.global;
  const idx = isAll ? 0 : state.summary.locations.findIndex((l) => String(l.id) === String(state.activeLoc)) + 1;
  const dot = dotFor(loc, idx);

  $('loc-headline').style.display = 'flex';
  $('loc-stats').style.display = 'grid';
  $('loc-eyebrow').textContent = isAll
    ? 'Aggregate · all locations'
    : `Single location · ${loc.code}`;
  $('loc-title-dot').style.background = dot;
  $('loc-title-name').textContent = loc.name;
  $('loc-title-meta').textContent = `${loc.city || '—'} · ${loc.province || '—'}`;
  $('header-sub').textContent = isAll
    ? 'At a glance — your inventory across every location'
    : `Stock physically held at ${loc.name}`;
  $('receive-btn-label').textContent = isAll ? 'Import stock' : 'Receive stock';

  const stats = [
    { label: 'Total units', value: fmt(loc.units) },
    { label: 'SKUs', value: fmt(loc.skus) },
    { label: 'Low stock', value: fmt(loc.low), tone: Number(loc.low) > 0 ? 'warn' : null },
    { label: 'Out of stock', value: fmt(loc.out), tone: Number(loc.out) > 0 ? 'danger' : null },
    { label: 'Stock value', value: fmtMoney(loc.value) },
  ];
  $('loc-stats').innerHTML = stats.map((s) => `
    <div class="loc-stat">
      <div class="loc-stat-label">${s.label}</div>
      <div class="loc-stat-value ${s.tone || ''}">${s.value}</div>
    </div>`).join('');

  if (isAll) renderAllView();
  else renderSingleView(loc);
}

function renderAllView() {
  const totalUnits = state.summary.global.units || 1;
  const breakdownRows = state.summary.locations.map((loc, i) => {
    const dot = dotFor(loc, i + 1);
    const sharePct = (Number(loc.units) / totalUnits) * 100;
    return `
      <div class="loc-table-row" data-loc-id="${loc.id}">
        <div class="name">
          <span class="dot" style="background:${dot}"></span>
          <div>
            ${escapeHtml(loc.name)}
            <div class="name-sub">${escapeHtml(loc.city || '—')}</div>
          </div>
        </div>
        <div class="loc-mono code-col">${escapeHtml(loc.code)}</div>
        <div>
          <div class="units-col">${fmt(loc.units)}</div>
          <div class="units-bar"><span style="width:${sharePct}%; background:${dot}"></span></div>
        </div>
        <div class="num-col ${Number(loc.low) > 0 ? 'warn' : ''}">${fmt(loc.low)}</div>
        <div class="num-col ${Number(loc.out) > 0 ? 'danger' : ''}">${fmt(loc.out)}</div>
        <div class="value-col">${fmtMoney(loc.value)}</div>
        <div class="arrow">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
      </div>`;
  }).join('');

  const breakdown = `
    <div class="loc-section-head">
      <div>
        <div class="loc-section-title">Stock by location</div>
        <div class="loc-section-sub">Click any location to view its detail</div>
      </div>
    </div>
    <div class="loc-table">
      <div class="loc-table-head">
        <div>Location</div>
        <div>Code</div>
        <div style="text-align:right;">Units</div>
        <div class="col-low" style="text-align:right;">Low</div>
        <div class="col-out" style="text-align:right;">Out</div>
        <div style="text-align:right;">Value</div>
        <div class="col-arrow"></div>
      </div>
      ${breakdownRows || '<div class="empty-state">No locations yet. Use “New location” above to add one.</div>'}
    </div>`;

  const matrix = renderInventoryMatrix();

  $('loc-body').innerHTML = breakdown + `
    <div class="loc-section-head">
      <div>
        <div class="loc-section-title">Inventory · global</div>
        <div class="loc-section-sub">Stock summed across all locations</div>
      </div>
    </div>
    ${matrix}`;

  $('loc-body').querySelectorAll('.loc-table-row').forEach((row) => {
    row.onclick = () => {
      state.activeLoc = row.dataset.locId;
      renderSelector();
      renderActive();
    };
  });

  wireProductRows();
}

function renderInventoryMatrix() {
  const locs = state.summary.locations;
  const headerCells = locs.map((l, i) => {
    const dot = dotFor(l, i + 1);
    const code = (l.code || '').split('-')[0];
    return `<div class="inv-loc-head"><span class="dot" style="background:${dot}"></span>${escapeHtml(code)}</div>`;
  }).join('');

  const rows = state.matrix.map((p) => {
    const cells = locs.map((l) => {
      const q = Number(p.by_location[l.id] || 0);
      const cls = q === 0 ? 'muted' : (q <= (p.reorder_level || 0) / 2 ? 'warn' : 'regular');
      return `<div class="inv-num inv-loc-cell ${cls}">${q}</div>`;
    }).join('');
    const total = Number(p.total || 0);
    const status = total === 0
      ? { type: 'out-of-stock', label: 'OUT' }
      : total <= (p.reorder_level || 0)
        ? { type: 'low-stock', label: 'LOW' }
        : { type: 'in-stock', label: 'IN' };
    return `
      <div class="inv-table-row" data-product-id="${p.id}">
        <div class="inv-prod">${escapeHtml(p.name)}</div>
        <div class="inv-sku">${escapeHtml(p.sku)}</div>
        <div class="inv-cat">${escapeHtml(p.category_name || '—')}</div>
        ${cells}
        <div class="inv-total">${fmt(total)}</div>
        <div><span class="status-badge status-${status.type}">${status.label}</span></div>
      </div>`;
  }).join('');

  return `
    <div class="inv-table matrix" style="--locs:${locs.length}">
      <div class="inv-table-head">
        <div>Product</div>
        <div>SKU</div>
        <div>Category</div>
        ${headerCells}
        <div style="text-align:right;">Total</div>
        <div>Status</div>
      </div>
      ${rows || '<div class="empty-state">No products to show.</div>'}
    </div>`;
}

function renderSingleView(loc) {
  const locCode = (loc.code || '').toUpperCase();
  const items = state.matrix.map((p) => {
    const qty = Number(p.by_location[loc.id] || 0);
    const belongsHere = locCode && p.sku && p.sku.toUpperCase().startsWith(locCode);
    const status = qty === 0
      ? { type: 'out-of-stock', label: 'OUT', tone: 'danger' }
      : qty <= (p.reorder_level || 0)
        ? { type: 'low-stock', label: 'LOW', tone: 'warn' }
        : { type: 'in-stock', label: 'IN', tone: '' };
    return { ...p, qty, status, belongsHere };
  }).filter((p) => p.qty > 0 || p.belongsHere);

  const rows = items.map((p) => {
    const qtyColor = p.status.tone === 'danger'
      ? 'var(--danger)'
      : p.status.tone === 'warn'
        ? 'var(--warning)'
        : 'var(--fg-1)';
    return `
      <div class="inv-table-row" data-product-id="${p.id}">
        <div class="inv-prod">${escapeHtml(p.name)}</div>
        <div class="inv-sku">${escapeHtml(p.sku)}</div>
        <div class="inv-cat">${escapeHtml(p.category_name || '—')}</div>
        <div class="inv-num ${p.status.tone}" style="font-weight:500;color:${qtyColor}">${fmt(p.qty)}</div>
        <div class="inv-num muted">${fmt(p.reorder_level || 0)}</div>
        <div class="inv-num regular">₱${Number(p.unit_price).toFixed(2)}</div>
        <div class="inv-total">${fmt(p.qty)}</div>
        <div><span class="status-badge status-${p.status.type}">${p.status.label}</span></div>
      </div>`;
  }).join('');

  $('loc-body').innerHTML = `
    <div class="loc-section-head">
      <div>
        <div class="loc-section-title">Inventory · ${escapeHtml(loc.name)}</div>
        <div class="loc-section-sub">Stock physically held at this location</div>
      </div>
      <span class="loc-link" id="see-all-link">
        See all locations
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </span>
    </div>
    <div class="inv-table single">
      <div class="inv-table-head">
        <div>Product</div>
        <div>SKU</div>
        <div>Category</div>
        <div style="text-align:right;">Qty</div>
        <div style="text-align:right;">Min</div>
        <div style="text-align:right;">Price</div>
        <div style="text-align:right;">Total</div>
        <div>Status</div>
      </div>
      ${rows || '<div class="empty-state">No inventory at this location yet.</div>'}
    </div>`;

  const link = $('see-all-link');
  if (link) link.onclick = () => { state.activeLoc = 'all'; renderSelector(); renderActive(); };
  wireProductRows();
}

function wireProductRows() {
  $('loc-body').querySelectorAll('.inv-table-row').forEach((row) => {
    row.onclick = () => { window.location.href = `/products.html?focus=${row.dataset.productId}`; };
  });
}

// ── Add Location modal ──────────────────────────────────
const addModal = $('add-loc-modal');
let addColor = SWATCHES[0];

function openAddLocation() {
  addColor = SWATCHES[0];
  $('add-loc-form').reset();
  $('al-code').value = '';
  $('add-loc-form').style.display = 'block';
  $('add-loc-success').style.display = 'none';
  renderColorPicker();
  addModal.style.display = 'flex';
  $('al-name').focus();
}
function closeAddLocation() { addModal.style.display = 'none'; }

function renderColorPicker() {
  const picker = $('al-color-picker');
  picker.innerHTML = '';
  SWATCHES.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'swatch' + (c === addColor ? ' selected' : '');
    el.style.background = c;
    el.onclick = () => { addColor = c; renderColorPicker(); };
    picker.appendChild(el);
  });
}

$('add-loc-close').onclick = closeAddLocation;
$('add-loc-cancel').onclick = closeAddLocation;
addModal.onclick = (e) => { if (e.target === addModal) closeAddLocation(); };
$('al-name').oninput = () => {
  $('al-code').value = locationCodeFromName($('al-name').value);
};

$('add-loc-form').onsubmit = async (e) => {
  e.preventDefault();
  const payload = {
    name: $('al-name').value.trim(),
    code: $('al-code').value.trim().toUpperCase(),
    type: $('al-type').value,
    address_line: $('al-address').value.trim() || null,
    barangay: $('al-barangay').value.trim() || null,
    city: $('al-city').value.trim() || null,
    province: $('al-province').value.trim() || null,
    postal_code: $('al-postal').value.trim() || null,
    color: addColor,
  };
  if (!payload.name) return;
  try {
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Failed to create location.');
      return;
    }
    $('add-loc-form').style.display = 'none';
    $('add-loc-success-sub').textContent = `${data.data.name} · ${data.data.code}`;
    $('add-loc-success').style.display = 'block';
    setTimeout(() => { closeAddLocation(); load(); }, 700);
  } catch {
    alert('Network error.');
  }
};

// ── Import Stock modal ──────────────────────────────────
const importModal = $('import-modal');
let importMode = 'single';
let multiQtys = {}; // {locId: qty | undefined}

function openImportStock() {
  if (state.products.length === 0) {
    alert('Add a product before importing stock.');
    return;
  }
  importMode = 'single';
  multiQtys = {};
  $('import-form').reset();
  $('import-form').style.display = 'block';
  $('import-success').style.display = 'none';
  $('import-modal-title').textContent = state.activeLoc === 'all' ? 'Import stock' : 'Receive stock';

  const prodSel = $('im-product');
  prodSel.innerHTML = state.products.map((p) =>
    `<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(p.sku)}</option>`
  ).join('');

  const locSel = $('im-loc');
  locSel.innerHTML = state.summary.locations.map((l) =>
    `<option value="${l.id}" ${String(l.id) === String(state.activeLoc) ? 'selected' : ''}>${escapeHtml(l.name)} (${escapeHtml(l.code)})</option>`
  ).join('');

  setImportMode('single');
  renderMultiList();
  importCurrentStock = 0;
  updateImportTotal();
  importModal.style.display = 'flex';

  // Fetch current stock for the initially selected product
  const initialProductId = Number(prodSel.value);
  if (initialProductId) fetchProductStock(initialProductId);
}
function closeImportStock() { importModal.style.display = 'none'; }

function setImportMode(mode) {
  importMode = mode;
  $('im-mode').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  $('im-single-pane').style.display = mode === 'single' ? 'grid' : 'none';
  $('im-multi-pane').style.display = mode === 'multi' ? 'block' : 'none';
  updateImportTotal();
}

function renderMultiList() {
  const list = $('im-multi-list');
  list.innerHTML = state.summary.locations.map((l, i) => {
    const dot = dotFor(l, i + 1);
    const enabled = multiQtys[l.id] !== undefined;
    return `
      <div class="multi-loc-row ${enabled ? 'enabled' : ''}" data-loc-id="${l.id}">
        <input type="checkbox" ${enabled ? 'checked' : ''} data-toggle="${l.id}">
        <div class="name">
          <span class="dot" style="background:${dot}"></span>
          <span>${escapeHtml(l.name)}</span>
          <span class="code">${escapeHtml(l.code)}</span>
        </div>
        <input type="number" min="0" placeholder="0" data-qty="${l.id}" ${enabled ? '' : 'disabled'} value="${enabled ? (multiQtys[l.id] || '') : ''}">
      </div>`;
  }).join('');

  list.querySelectorAll('input[type="checkbox"][data-toggle]').forEach((cb) => {
    cb.onchange = (e) => {
      const id = e.target.dataset.toggle;
      if (e.target.checked) multiQtys[id] = '';
      else delete multiQtys[id];
      renderMultiList();
      updateImportTotal();
    };
  });
  list.querySelectorAll('input[type="number"][data-qty]').forEach((inp) => {
    inp.oninput = (e) => {
      multiQtys[e.target.dataset.qty] = e.target.value;
      updateImportTotal();
    };
  });
}

let importCurrentStock = 0;

function updateImportTotal() {
  let addQty = 0;
  if (importMode === 'single') addQty = Number($('im-qty').value) || 0;
  else addQty = Object.values(multiQtys).reduce((s, v) => s + (Number(v) || 0), 0);

  $('im-current-stock').textContent = fmt(importCurrentStock);
  $('im-total').textContent = addQty > 0 ? `+${fmt(addQty)}` : '+0';
  $('im-new-total').textContent = fmt(importCurrentStock + addQty);

  const btn = $('import-submit');
  btn.disabled = addQty <= 0;
  btn.textContent = `Import ${fmt(addQty)} units`;
}

async function fetchProductStock(productId) {
  try {
    const res = await fetch(`/api/products/${productId}/stock`, { headers: authHeaders });
    const data = await res.json();
    if (data.success) {
      importCurrentStock = data.data.reduce((sum, loc) => sum + parseInt(loc.quantity), 0);
    } else {
      importCurrentStock = 0;
    }
  } catch {
    importCurrentStock = 0;
  }
  updateImportTotal();
}

// When product selection changes, fetch its current stock
$('im-product').onchange = () => fetchProductStock(Number($('im-product').value));

$('im-mode').onclick = (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (btn) setImportMode(btn.dataset.mode);
};
$('im-qty').oninput = updateImportTotal;
$('import-close').onclick = closeImportStock;
$('import-cancel').onclick = closeImportStock;
importModal.onclick = (e) => { if (e.target === importModal) closeImportStock(); };

$('import-form').onsubmit = async (e) => {
  e.preventDefault();
  const product_id = Number($('im-product').value);
  let allocations = [];
  if (importMode === 'single') {
    const qty = Number($('im-qty').value) || 0;
    if (qty > 0) allocations = [{ location_id: Number($('im-loc').value), quantity: qty }];
  } else {
    allocations = Object.entries(multiQtys)
      .map(([location_id, qty]) => ({ location_id: Number(location_id), quantity: Number(qty) || 0 }))
      .filter((a) => a.quantity > 0);
  }
  if (!product_id || allocations.length === 0) return;

  try {
    const res = await fetch('/api/locations/import-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ product_id, allocations }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Failed to import stock.');
      return;
    }
    const total = data.data.total_units;
    const product = state.products.find((p) => p.id === product_id);
    $('import-form').style.display = 'none';
    $('import-success-title').textContent = `Imported ${fmt(total)} units`;
    $('import-success-sub').textContent = `${product ? product.name : ''} · ${allocations.length} location${allocations.length === 1 ? '' : 's'}`;
    $('import-success').style.display = 'block';
    setTimeout(() => { closeImportStock(); load(); }, 800);
  } catch {
    alert('Network error.');
  }
};

// ── Header buttons ──────────────────────────────────────
$('receive-btn').onclick = () => openImportStock();
$('export-btn').onclick = () => { window.location.href = '/import-export.html'; };

load();
