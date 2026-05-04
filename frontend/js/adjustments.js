// Adjustments — wired to /api/adjustments, /api/products, /api/locations, /api/reason-codes
// Backend response: { success, count, data: [{ id, adjustment_type, quantity_change,
//   notes, adjustment_date, product_name, sku, location_name, to_location_name,
//   reason_code, reason_description, adjusted_by }] }

const adjList       = document.getElementById('adjustments-list');
const loadingState  = document.getElementById('loading-state');
const noDataState   = document.getElementById('no-data-state');
const modal         = document.getElementById('adjustment-modal');
const form          = document.getElementById('adjustment-form');

const productIdInput   = document.getElementById('product_id');
const productSearchInp = document.getElementById('product_search');
const productCombobox  = document.getElementById('product-combobox');
const productPanel     = document.getElementById('product-suggestions');
const productHint      = document.getElementById('product-hint');
const locationSelect   = document.getElementById('location_id');
const reasonSelect     = document.getElementById('reason_code_id');
const typeSelect       = document.getElementById('adjustment_type');

// Catalog used by the combobox: [{ id, name, sku, by_location: {locId: qty} }]
let productCatalog = [];
let activeIndex = -1;
let lastFiltered = [];

const statMonth   = document.getElementById('stat-month');
const statNet     = document.getElementById('stat-net');
const statLargest = document.getElementById('stat-largest');
const statMonthHint   = document.getElementById('stat-month-hint');
const statNetHint     = document.getElementById('stat-net-hint');
const statLargestHint = document.getElementById('stat-largest-hint');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function initials(name) {
  return String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} · ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderStats(data) {
  // This-month adjustments
  const now = new Date();
  const thisMonth = data.filter(a => {
    const d = new Date(a.adjustment_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  statMonth.textContent = thisMonth.length;
  statMonthHint.textContent = `${data.length} all time`;

  // Net change
  const net = data.reduce((sum, a) => {
    const sign = a.adjustment_type === 'DECREASE' ? -1 : 1;
    return sum + sign * Number(a.quantity_change || 0);
  }, 0);
  statNet.textContent = (net > 0 ? '+' : '') + net;
  statNet.classList.toggle('success', net > 0);
  statNet.classList.toggle('danger',  net < 0);
  const skuSet = new Set(data.map(a => a.sku).filter(Boolean));
  statNetHint.textContent = `across ${skuSet.size} SKUs`;

  // Largest single adjustment
  const largest = data.reduce((best, a) => {
    const v = Math.abs(Number(a.quantity_change || 0));
    return v > best.v ? { v, row: a } : best;
  }, { v: 0, row: null });
  if (largest.row) {
    const sign = largest.row.adjustment_type === 'DECREASE' ? '-' : '+';
    statLargest.textContent = `${sign}${largest.v}`;
    statLargestHint.textContent = `${largest.row.product_name || ''} · ${(largest.row.reason_description || largest.row.reason_code || '').toString().toLowerCase()}`.trim();
  } else {
    statLargest.textContent = '—';
    statLargestHint.textContent = 'no adjustments yet';
  }
}

function renderRows(data) {
  // Wipe everything except loader/empty placeholders
  Array.from(adjList.querySelectorAll('.adj-row')).forEach(n => n.remove());

  if (data.length === 0) {
    noDataState.style.display = '';
    loadingState.style.display = 'none';
    return;
  }
  noDataState.style.display = 'none';
  loadingState.style.display = 'none';

  data.forEach(a => {
    const sign = a.adjustment_type === 'DECREASE' ? '-' : a.adjustment_type === 'TRANSFER' ? '→' : '+';
    const deltaColor = a.adjustment_type === 'INCREASE' ? 'var(--success)'
                     : a.adjustment_type === 'DECREASE' ? 'var(--danger)'
                     : 'var(--warning)';

    const row = document.createElement('div');
    row.className = 'row adj-row';
    row.style.gridTemplateColumns = '120px 1fr 80px 1fr 140px 60px';
    row.innerHTML = `
      <div class="mono" style="color:var(--fg-4);font-size:11px;">${escapeHtml(fmtDate(a.adjustment_date))}</div>
      <div>
        <div style="font-size:13px;font-weight:500;color:var(--fg-1);">${escapeHtml(a.product_name || 'Unknown')}</div>
        <div class="sub">${escapeHtml(a.sku || '')}</div>
      </div>
      <div class="mono" style="color:${deltaColor};font-weight:500;font-size:14px;">${sign}${escapeHtml(a.quantity_change ?? 0)}</div>
      <div style="color:var(--fg-2);font-size:12px;">${escapeHtml(a.reason_description || a.reason_code || '—')}</div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="avatar-circle sm">${escapeHtml(initials(a.adjusted_by))}</div>
        <span style="color:var(--fg-3);font-size:12px;">${escapeHtml(a.adjusted_by || 'System')}</span>
      </div>
      <div class="mono" style="color:var(--fg-4);font-size:10px;text-align:right;">${escapeHtml((a.location_name || '—').slice(0, 6).toUpperCase())}</div>
    `;
    adjList.appendChild(row);
  });
}

async function loadData() {
  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  try {
    const res = await fetch('/api/adjustments', { headers });
    const data = await res.json();
    if (data.success) {
      const rows = data.data || [];
      renderStats(rows);
      renderRows(rows);
    } else {
      loadingState.textContent = data.message || 'Failed to load adjustments.';
    }

    // Populate dropdowns
    const [pRes, lRes, rRes] = await Promise.all([
      fetch('/api/locations/inventory-matrix', { headers }),
      fetch('/api/locations', { headers }),
      fetch('/api/reason-codes', { headers }),
    ]);
    const pData = await pRes.json();
    const lData = await lRes.json();
    const rData = await rRes.json();

    if (pData.success) {
      // Inventory matrix gives us by_location stock counts per product
      productCatalog = (pData.data || []).map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        by_location: p.by_location || {},
        total: Number(p.total || 0),
      }));
    }
    if (lData.success) {
      locationSelect.innerHTML = '<option value="">Select a location…</option>';
      const toSel = document.getElementById('to_location_id');
      toSel.innerHTML = '<option value="">Select destination…</option>';
      (lData.data || []).forEach(l => {
        locationSelect.add(new Option(l.name, l.id));
        toSel.add(new Option(l.name, l.id));
      });
    }
    if (rData.success) {
      reasonSelect.innerHTML = '<option value="">Select a reason…</option>';
      (rData.data || []).forEach(r => reasonSelect.add(new Option(`${r.code} — ${r.description}`, r.id)));
    }
  } catch (err) {
    loadingState.textContent = 'Network error.';
  }
}

// ── Searchable product combobox ────────────
function getEligibleProducts() {
  // For TRANSFER, only show products with stock at the chosen source location.
  // For INCREASE/DECREASE (or no location chosen), show every product.
  const isTransfer = typeSelect.value === 'TRANSFER';
  const srcLocId = locationSelect.value;
  if (isTransfer && srcLocId) {
    return productCatalog.filter(p => Number(p.by_location[srcLocId] || 0) > 0);
  }
  return productCatalog.slice();
}

function scoreProduct(p, q) {
  if (!q) return 1; // no query — keep all, rank by name
  const name = p.name.toLowerCase();
  const sku  = p.sku.toLowerCase();
  if (name.startsWith(q)) return 100;
  // word-start match in name
  if (name.split(/\s+/).some(w => w.startsWith(q))) return 80;
  if (sku.startsWith(q)) return 70;
  if (name.includes(q)) return 50;
  if (sku.includes(q)) return 30;
  return 0;
}

function highlight(text, q) {
  if (!q) return escapeHtml(text);
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, i)) +
    '<mark>' + escapeHtml(text.slice(i, i + q.length)) + '</mark>' +
    escapeHtml(text.slice(i + q.length))
  );
}

function renderSuggestions() {
  const q = productSearchInp.value.trim().toLowerCase();
  const pool = getEligibleProducts();
  const scored = pool
    .map(p => ({ p, s: scoreProduct(p, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name));

  lastFiltered = scored.map(x => x.p);

  // Hint about transfer-source filtering
  const isTransfer = typeSelect.value === 'TRANSFER';
  const hasSrc = !!locationSelect.value;
  if (isTransfer && !hasSrc) {
    productHint.textContent = 'Pick a source location below to see its products.';
    productHint.className = 'combobox-hint warn';
    productHint.hidden = false;
  } else if (isTransfer && hasSrc) {
    const locName = locationSelect.options[locationSelect.selectedIndex]?.text || '';
    productHint.textContent = `Showing products in stock at ${locName}.`;
    productHint.className = 'combobox-hint';
    productHint.hidden = false;
  } else {
    productHint.hidden = true;
  }

  if (lastFiltered.length === 0) {
    productPanel.innerHTML = `<div class="combobox-empty">${
      pool.length === 0 ? 'No products available for this location.' : 'No matches.'
    }</div>`;
    activeIndex = -1;
    productPanel.hidden = false;
    return;
  }

  // Limit DOM size
  const MAX = 50;
  const top = lastFiltered.slice(0, MAX);
  activeIndex = 0;

  productPanel.innerHTML = top.map((p, i) => {
    const recommended = i === 0 && q.length > 0;
    return `
      <div class="combobox-option ${i === activeIndex ? 'active' : ''} ${recommended ? 'recommended' : ''}"
           data-id="${p.id}" data-index="${i}">
        <div class="opt-main">
          <span class="opt-name">${recommended ? '<span class="opt-tag">Top match</span>' : ''}${highlight(p.name, q)}</span>
          <span class="opt-sku">${highlight(p.sku, q)}</span>
        </div>
      </div>`;
  }).join('');
  productPanel.hidden = false;
}

function selectProduct(p) {
  productIdInput.value = p.id;
  productSearchInp.value = `${p.name} (${p.sku})`;
  productPanel.hidden = true;
  productHint.hidden = true;
}

function clearProductSelection() {
  productIdInput.value = '';
}

productSearchInp.addEventListener('input', () => {
  clearProductSelection();
  renderSuggestions();
});
productSearchInp.addEventListener('focus', renderSuggestions);

productSearchInp.addEventListener('keydown', (e) => {
  if (productPanel.hidden) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { renderSuggestions(); e.preventDefault(); }
    return;
  }
  const max = Math.min(lastFiltered.length, 50);
  if (e.key === 'ArrowDown') {
    activeIndex = Math.min(activeIndex + 1, max - 1);
    refreshActive();
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    activeIndex = Math.max(activeIndex - 1, 0);
    refreshActive();
    e.preventDefault();
  } else if (e.key === 'Enter') {
    if (activeIndex >= 0 && lastFiltered[activeIndex]) {
      selectProduct(lastFiltered[activeIndex]);
      e.preventDefault();
    }
  } else if (e.key === 'Escape') {
    productPanel.hidden = true;
  }
});

function refreshActive() {
  productPanel.querySelectorAll('.combobox-option').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.index) === activeIndex);
  });
  const cur = productPanel.querySelector('.combobox-option.active');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

productPanel.addEventListener('mousedown', (e) => {
  const opt = e.target.closest('.combobox-option');
  if (!opt) return;
  const p = lastFiltered[Number(opt.dataset.index)];
  if (p) selectProduct(p);
  e.preventDefault();
});

document.addEventListener('mousedown', (e) => {
  if (!productCombobox.contains(e.target)) productPanel.hidden = true;
});

// ── Modal ────────────────────────────────
function resetProductPicker() {
  productSearchInp.value = '';
  productIdInput.value = '';
  productPanel.hidden = true;
  productHint.hidden = true;
}

document.getElementById('new-adjustment-btn').onclick = () => {
  resetProductPicker();
  modal.style.display = 'flex';
};
document.getElementById('cancel-btn').onclick = () => {
  modal.style.display = 'none';
  document.getElementById('to-location-group').style.display = 'none';
  resetProductPicker();
  form.reset();
};
modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

typeSelect.addEventListener('change', (e) => {
  const grp = document.getElementById('to-location-group');
  const sel = document.getElementById('to_location_id');
  if (e.target.value === 'TRANSFER') {
    grp.style.display = 'block';
    sel.setAttribute('required', 'required');
  } else {
    grp.style.display = 'none';
    sel.removeAttribute('required');
  }
  // Re-evaluate: if currently picked product is no longer eligible, clear it.
  if (productIdInput.value) {
    const eligible = getEligibleProducts().some(p => String(p.id) === String(productIdInput.value));
    if (!eligible) resetProductPicker();
  }
  if (!productPanel.hidden) renderSuggestions();
});

locationSelect.addEventListener('change', () => {
  if (productIdInput.value) {
    const eligible = getEligibleProducts().some(p => String(p.id) === String(productIdInput.value));
    if (!eligible) resetProductPicker();
  }
  if (!productPanel.hidden) renderSuggestions();
});

form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  const type = typeSelect.value;

  if (!productIdInput.value) {
    productSearchInp.focus();
    alert('Please pick a product from the search list.');
    return;
  }

  const payload = {
    product_id: parseInt(productIdInput.value, 10),
    location_id: parseInt(locationSelect.value, 10),
    to_location_id: type === 'TRANSFER' ? parseInt(document.getElementById('to_location_id').value, 10) : null,
    adjustment_type: type,
    quantity_change: parseInt(document.getElementById('quantity_change').value, 10),
    reason_code_id: parseInt(reasonSelect.value, 10),
    notes: document.getElementById('notes').value || null,
  };

  try {
    const res = await fetch('/api/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) {
      modal.style.display = 'none';
      resetProductPicker();
      form.reset();
      loadData();
    } else {
      alert(result.message || 'Could not save adjustment.');
    }
  } catch { alert('Network error.'); }
};

loadData();
