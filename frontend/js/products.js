function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

const tableBody = document.getElementById('products-table-body');
const loadingState = document.getElementById('loading-state');
const modal = document.getElementById('product-modal');
const form = document.getElementById('product-form');

const categoryFilter = document.getElementById('filter-category');
const supplierFilter = document.getElementById('filter-supplier');
const searchInput = document.getElementById('search-input');
const skuPreview = document.getElementById('sku-preview');
const trackExpiryCheckbox = document.getElementById('track_expiry');
const expiryDateGroup = document.getElementById('expiry-date-group');
const expiryDateInput = document.getElementById('expiry_date');

// Multi-location picker state
let locationsCache = [];
let selectedLocationIds = [];
const pickerBtn = document.getElementById('location-picker-btn');
const pickerLabel = document.getElementById('location-picker-label');
const pickerDropdown = document.getElementById('location-dropdown');
const pickerOptions = document.getElementById('location-options');

// Unit combobox state
const unitSearch = document.getElementById('unit_search');
const unitHidden = document.getElementById('unit_of_measure');
const unitPanel  = document.getElementById('unit-suggestions');
let unitActiveIndex = -1;
const unitCatalog = [
  { v: 'pcs', l: 'Pieces (pcs)', c: 'Count' },
  { v: 'units', l: 'Units', c: 'Count' },
  { v: 'sets', l: 'Sets', c: 'Count' },
  { v: 'pairs', l: 'Pairs', c: 'Count' },
  { v: 'dozen', l: 'Dozen', c: 'Count' },
  { v: 'gross', l: 'Gross', c: 'Count' },
  { v: 'ream', l: 'Ream (Paper)', c: 'Count' },
  { v: 'sheet', l: 'Sheet', c: 'Count' },
  { v: 'pad', l: 'Pad', c: 'Count' },
  { v: 'box', l: 'Box / Case', c: 'Packaging' },
  { v: 'pack', l: 'Pack / Sachet', c: 'Packaging' },
  { v: 'bundle', l: 'Bundle / Crate', c: 'Packaging' },
  { v: 'roll', l: 'Roll / Spool', c: 'Packaging' },
  { v: 'bag', l: 'Bag / Pouch', c: 'Packaging' },
  { v: 'carton', l: 'Carton', c: 'Packaging' },
  { v: 'pallet', l: 'Pallet', c: 'Packaging' },
  { v: 'tray', l: 'Tray', c: 'Packaging' },
  { v: 'tube', l: 'Tube', c: 'Packaging' },
  { v: 'bottle', l: 'Bottle / Vial', c: 'Packaging' },
  { v: 'can', l: 'Can / Jar', c: 'Packaging' },
  { v: 'drum', l: 'Drum / Barrel', c: 'Packaging' },
  { v: 'bin', l: 'Bin / Tank', c: 'Packaging' },
  { v: 'kg', l: 'Kilograms (kg)', c: 'Weight' },
  { v: 'g', l: 'Grams (g)', c: 'Weight' },
  { v: 'mg', l: 'Milligrams (mg)', c: 'Weight' },
  { v: 'ton', l: 'Metric Ton (t)', c: 'Weight' },
  { v: 'lb', l: 'Pounds (lb)', c: 'Weight' },
  { v: 'oz', l: 'Ounces (oz)', c: 'Weight' },
  { v: 'L', l: 'Liters (L)', c: 'Volume' },
  { v: 'ml', l: 'Milliliters (ml)', c: 'Volume' },
  { v: 'gal', l: 'Gallons (gal)', c: 'Volume' },
  { v: 'fl-oz', l: 'Fluid Ounces (fl oz)', c: 'Volume' },
  { v: 'cup', l: 'Cup', c: 'Volume' },
  { v: 'pint', l: 'Pint', c: 'Volume' },
  { v: 'qt', l: 'Quart', c: 'Volume' },
  { v: 'm', l: 'Meters (m)', c: 'Length' },
  { v: 'cm', l: 'Centimeters (cm)', c: 'Length' },
  { v: 'mm', l: 'Millimeters (mm)', c: 'Length' },
  { v: 'km', l: 'Kilometers (km)', c: 'Length' },
  { v: 'ft', l: 'Feet (ft)', c: 'Length' },
  { v: 'in', l: 'Inches (in)', c: 'Length' },
  { v: 'yd', l: 'Yards (yd)', c: 'Length' },
  { v: 'sq-m', l: 'Square Meters (sq m)', c: 'Area' },
  { v: 'sq-ft', l: 'Square Feet (sq ft)', c: 'Area' },
  { v: 'acre', l: 'Acre', c: 'Area' }
];
let unitFiltered = [];

// ── Location multi-select ────────────────────────────────
function renderLocationOptions() {
  pickerOptions.innerHTML = locationsCache.map(l => {
    const checked = selectedLocationIds.includes(String(l.id)) ? 'checked' : '';
    const color = l.color || '#6c757d';
    return `
      <label class="multi-select-option">
        <input type="checkbox" value="${l.id}" ${checked}>
        <span class="loc-dot" style="background:${color}"></span>
        <span class="loc-label">${l.name}</span>
        <span class="loc-code">${l.code}</span>
      </label>`;
  }).join('');

  pickerOptions.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) {
        if (!selectedLocationIds.includes(cb.value)) selectedLocationIds.push(cb.value);
      } else {
        selectedLocationIds = selectedLocationIds.filter(id => id !== cb.value);
      }
      updatePickerLabel();
      updateSkuPreview();
    };
  });
}

function updatePickerLabel() {
  if (selectedLocationIds.length === 0) {
    pickerLabel.textContent = 'Select locations';
  } else if (selectedLocationIds.length === 1) {
    const loc = locationsCache.find(l => String(l.id) === selectedLocationIds[0]);
    pickerLabel.textContent = loc ? `${loc.name} (${loc.code})` : '1 location';
  } else {
    pickerLabel.textContent = `${selectedLocationIds.length} locations selected`;
  }
}

pickerBtn.onclick = (e) => {
  e.stopPropagation();
  const open = pickerDropdown.style.display !== 'none';
  pickerDropdown.style.display = open ? 'none' : 'block';
};

// ── Expiry toggle ────────────────────────────────────────
function toggleExpiryDate() {
  const show = trackExpiryCheckbox.checked;
  expiryDateGroup.style.display = show ? '' : 'none';
  if (show) {
    // Prevent selecting dates in the past or with absurd years
    const today = new Date().toISOString().split('T')[0];
    expiryDateInput.setAttribute('min', today);
    expiryDateInput.setAttribute('max', '9999-12-31');
  } else {
    expiryDateInput.value = '';
  }
}
trackExpiryCheckbox.onchange = toggleExpiryDate;
toggleExpiryDate();

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!document.getElementById('location-picker').contains(e.target)) {
    pickerDropdown.style.display = 'none';
  }
});

// ── Load products ────────────────────────────────────────
async function loadProducts() {
  const token = sessionStorage.getItem('token');
  const params = new URLSearchParams();
  if (searchInput.value) params.append('search', searchInput.value);
  if (categoryFilter.value) params.append('category_id', categoryFilter.value);
  if (supplierFilter.value) params.append('supplier_id', supplierFilter.value);

  try {
    const res = await fetch(`/api/products?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    loadingState.style.display = 'none';
    if (data.success) {
      tableBody.innerHTML = '';
      data.data.forEach(p => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>
            <div style="display:flex;align-items:center;">
              <span class="product-thumb">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              </span>
              <div class="product-info">
                <span class="product-name">${escapeHtml(p.name)}</span>
                <span class="product-sku">${escapeHtml(p.current_sku || p.sku)}</span>
              </div>
            </div>
          </td>
          <td style="color:var(--fg-3);">${escapeHtml(p.category_name || '—')}</td>
          <td style="text-align:right;font-family:'DM Mono',monospace;color:var(--fg-2);">₱${parseFloat(p.unit_price).toFixed(2)}</td>
          <td><span class="stock-badge stock-in">Fetching…</span></td>
          <td style="text-align:right;">
            <button class="action-btn" title="View History" onclick="window.location.href='/stock-history.html?product_id=${p.id}'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
            <button class="action-btn adjust-btn" data-id="${p.id}" title="Adjust stock">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </button>
            <button class="action-btn edit-btn" data-id="${p.id}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="action-btn delete-btn" data-id="${p.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        `;
        tableBody.appendChild(row);
        fetchStock(p.id, row.cells[3].querySelector('.stock-badge'), p.reorder_level);
      });
    }
  } catch (err) {
    loadingState.textContent = 'Failed to load products.';
  }
}

async function fetchStock(productId, badge, reorderLevel) {
  const token = sessionStorage.getItem('token');
  try {
    const res = await fetch(`/api/products/${productId}/stock`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      const total = data.data.reduce((sum, loc) => sum + parseInt(loc.quantity), 0);
      badge.textContent = `${total} in stock`;
      badge.classList.remove('stock-in');
      if (total === 0) badge.classList.add('stock-out');
      else if (total <= reorderLevel) badge.classList.add('stock-low');
      else badge.classList.add('stock-in');
    }
  } catch (err) { badge.textContent = 'Error'; }
}

// ── Load filters ─────────────────────────────────────────
async function loadFilters() {
  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  const cRes = await fetch('/api/categories', { headers });
  const cData = await cRes.json();
  if (cData.success) {
    (cData.data || cData.categories || []).forEach(c => {
      const opt = new Option(c.name, c.id);
      categoryFilter.add(opt.cloneNode(true));
      document.getElementById('category_id').add(opt);
    });
  }

  const sRes = await fetch('/api/suppliers', { headers });
  const sData = await sRes.json();
  if (sData.success) {
    (sData.data || sData.suppliers || []).forEach(s => {
      const opt = new Option(s.name, s.id);
      supplierFilter.add(opt.cloneNode(true));
      document.getElementById('supplier_id').add(opt);
    });
  }

  const lRes = await fetch('/api/locations', { headers });
  const lData = await lRes.json();
  if (lData.success) {
    locationsCache = lData.data || [];
    renderLocationOptions();
  }
}

// ── SKU preview ──────────────────────────────────────────
function locationFromSku(sku) {
  return locationsCache.find(l => String(sku || '').startsWith(`${l.code}-`));
}

async function updateSkuPreview(currentSku) {
  if (currentSku) {
    skuPreview.textContent = `Current SKU: ${currentSku}`;
    return;
  }

  const primaryLocationId = selectedLocationIds[0];
  if (!primaryLocationId) {
    skuPreview.textContent = 'SKU will be generated from the first selected location.';
    return;
  }

  const token = sessionStorage.getItem('token');
  try {
    const res = await fetch(`/api/products/next-sku?location_id=${encodeURIComponent(primaryLocationId)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    skuPreview.textContent = data.success ? `Generated SKU: ${data.data.sku}` : 'SKU will be generated on save.';
  } catch (err) {
    skuPreview.textContent = 'SKU will be generated on save.';
  }
}

// ── Event listeners ──────────────────────────────────────
searchInput.oninput = loadProducts;
categoryFilter.onchange = loadProducts;
supplierFilter.onchange = loadProducts;

document.getElementById('new-product-btn').onclick = () => {
  form.reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('modal-title').textContent = 'New product';
  selectedLocationIds = [];
  document.getElementById('location-picker').style.display = '';
  const qtyRow = document.getElementById('initial-qty-row');
  const qtyInput = document.getElementById('initial_quantity');
  const qtyLabel = qtyRow.querySelector('label');
  qtyRow.style.display = '';
  qtyLabel.textContent = 'Initial quantity';
  qtyInput.value = '0';
  qtyInput.readOnly = false;
  qtyInput.style.opacity = '1';
  trackExpiryCheckbox.checked = false;
  expiryDateInput.value = '';
  toggleExpiryDate();
  updatePickerLabel();
  renderLocationOptions();
  updateSkuPreview();
  resetUnitCombobox();
  modal.style.display = 'flex';
};

// ── Unit Combobox Logic ──────────────────
function renderUnitSuggestions() {
  const q = unitSearch.value.trim().toLowerCase();
  unitFiltered = unitCatalog.filter(u => 
    u.l.toLowerCase().includes(q) || u.v.toLowerCase().includes(q)
  );

  if (unitFiltered.length === 0) {
    unitPanel.innerHTML = '<div class="combobox-empty">No matching units.</div>';
    unitPanel.style.display = 'block';
    unitActiveIndex = -1;
    return;
  }

  unitFiltered = unitFiltered.slice(0, 4);
  unitActiveIndex = 0;
  unitPanel.innerHTML = unitFiltered.map((u, i) => `
    <div class="combobox-option ${i === 0 ? 'active' : ''}" data-index="${i}">
      <span class="opt-label">${escapeHtml(u.l)}</span>
      <span class="opt-category">${escapeHtml(u.c)}</span>
    </div>
  `).join('');
  unitPanel.style.display = 'block';
}

function selectUnit(u) {
  unitSearch.value = u.l;
  unitHidden.value = u.v;
  unitPanel.style.display = 'none';
}

function resetUnitCombobox() {
  unitSearch.value = '';
  unitHidden.value = '';
  unitPanel.style.display = 'none';
  unitActiveIndex = -1;
}

unitSearch.oninput = () => {
  unitHidden.value = ''; // Force selection
  renderUnitSuggestions();
};
unitSearch.onfocus = renderUnitSuggestions;

unitSearch.onkeydown = (e) => {
  if (unitPanel.style.display === 'none') return;
  const items = unitPanel.querySelectorAll('.combobox-option');
  if (e.key === 'ArrowDown') {
    unitActiveIndex = (unitActiveIndex + 1) % unitFiltered.length;
    updateUnitActive(items);
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    unitActiveIndex = (unitActiveIndex - 1 + unitFiltered.length) % unitFiltered.length;
    updateUnitActive(items);
    e.preventDefault();
  } else if (e.key === 'Enter') {
    if (unitActiveIndex >= 0) {
      selectUnit(unitFiltered[unitActiveIndex]);
      e.preventDefault();
    }
  }
};

function updateUnitActive(items) {
  items.forEach((item, i) => item.classList.toggle('active', i === unitActiveIndex));
  const active = unitPanel.querySelector('.combobox-option.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

unitPanel.onmousedown = (e) => {
  const opt = e.target.closest('.combobox-option');
  if (opt) {
    selectUnit(unitFiltered[parseInt(opt.dataset.index)]);
  }
};

document.addEventListener('mousedown', (e) => {
  if (!document.getElementById('unit-combobox').contains(e.target)) {
    unitPanel.style.display = 'none';
  }
});

document.getElementById('cancel-btn').onclick = () => {
  modal.style.display = 'none';
  pickerDropdown.style.display = 'none';
};

// ── Form submit ──────────────────────────────────────────
form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  const id = document.getElementById('edit-id').value;
  const isEdit = Boolean(id);

  if (!isEdit && selectedLocationIds.length === 0) {
    alert('Please select at least one location.');
    return;
  }

  const trackExpiry = trackExpiryCheckbox.checked;
  const reorderRaw = document.getElementById('reorder_level').value;
  const uom = unitHidden.value;

  if (!uom) {
    unitSearch.focus();
    alert('Please select a valid unit from the list.');
    return;
  }

  const basePayload = {
    name: document.getElementById('name').value,
    category_id: parseInt(document.getElementById('category_id').value),
    supplier_id: document.getElementById('supplier_id').value ? parseInt(document.getElementById('supplier_id').value) : null,
    unit_price: parseFloat(document.getElementById('unit_price').value),
    reorder_level: reorderRaw === '' ? 10 : parseInt(reorderRaw, 10),
    unit_of_measure: uom,
    track_expiry: trackExpiry
  };
  if (trackExpiry && expiryDateInput.value) {
    const dateVal = expiryDateInput.value;
    const year = parseInt(dateVal.split('-')[0], 10);
    const today = new Date().toISOString().split('T')[0];
    if (year < 2000 || year > 9999) {
      alert('Please enter a valid expiry year (4 digits).');
      expiryDateInput.focus();
      return;
    }
    if (dateVal < today) {
      alert('Expiry date cannot be in the past.');
      expiryDateInput.focus();
      return;
    }
    basePayload.expiry_date = dateVal;
  }

  if (isEdit) {
    // Edit mode is metadata-only. Stock changes go through the dedicated
    // "Adjust stock" modal so every change is location-scoped.
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(basePayload)
      });
      const result = await res.json();
      if (!result.success) {
        alert('Error: ' + result.message);
        return;
      }
      modal.style.display = 'none';
      loadProducts();
    } catch (err) { alert('Network error.'); }
  } else {
    // Create mode — POST once per selected location
    // The first location is the "primary" that determines the SKU prefix.
    // Since product_stock auto-seeds for ALL locations via DB trigger,
    // we create the product once with the first location for SKU generation.
    const initialQty = parseInt(document.getElementById('initial_quantity').value) || 0;
    const payload = { ...basePayload, location_id: parseInt(selectedLocationIds[0]), initial_quantity: initialQty };
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        modal.style.display = 'none';
        pickerDropdown.style.display = 'none';
        loadProducts();
      } else {
        alert('Error: ' + result.message);
      }
    } catch (err) { alert('Network error.'); }
  }
};

// ── Table actions (edit / delete / adjust stock) ────────────
// Clicks land on the SVG inside the buttons most of the time, so resolve
// the actual button via closest() before reading data-id. Without this
// the modal silently fails to open whenever the user lands on the icon.
tableBody.onclick = async (e) => {
  const deleteBtn = e.target.closest('.delete-btn');
  const editBtn = e.target.closest('.edit-btn');
  const adjustBtn = e.target.closest('.adjust-btn');

  if (deleteBtn) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    const id = deleteBtn.dataset.id;
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if ((await res.json()).success) loadProducts();
    return;
  }

  if (adjustBtn) {
    openStockModal(adjustBtn.dataset.id);
    return;
  }

  if (editBtn) {
    const id = editBtn.dataset.id;
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/api/products/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      const p = data.data;
      document.getElementById('edit-id').value = p.id;
      document.getElementById('name').value = p.name;

      // The metadata modal is for *metadata only*. Stock changes go
      // through the dedicated "Adjust stock" modal, so hide the qty row
      // entirely here — keeping it would just take up vertical space
      // without offering any control the user can act on.
      document.getElementById('initial-qty-row').style.display = 'none';

      updateSkuPreview(p.current_sku || p.sku);
      document.getElementById('category_id').value = p.category_id;
      document.getElementById('supplier_id').value = p.supplier_id || '';
      document.getElementById('unit_price').value = p.unit_price;
      document.getElementById('reorder_level').value = p.reorder_level;
      
      const unit = unitCatalog.find(u => u.v === p.unit_of_measure) || { v: 'pcs', l: 'Pieces (pcs)' };
      unitSearch.value = unit.l;
      unitHidden.value = unit.v;

      document.getElementById('track_expiry').checked = p.track_expiry;
      if (p.initial_expiry_date) {
        expiryDateInput.value = p.initial_expiry_date.split('T')[0];
      } else {
        expiryDateInput.value = '';
      }
      toggleExpiryDate();

      document.getElementById('modal-title').textContent = 'Edit product';
      modal.style.display = 'flex';
    }
  }
}

// ── Adjust Stock Modal ─────────────────────────────────────
// Opens a dedicated dialog for changing on-hand quantities per location.
// Shows current stock for every location the product is currently at,
// lets the user type a new total per row, and (under a disclosure) add
// the product to a new location. Save submits the full set of changes
// in one transaction via /api/products/:id/adjust-stock.
const stockModal = document.getElementById('stock-modal');
const stockForm = document.getElementById('stock-form');
const stockRowsEl = document.getElementById('stock-rows');
const stockEmptyEl = document.getElementById('stock-empty-state');
const stockErrorEl = document.getElementById('stock-form-error');
const stockProductLine = document.getElementById('stock-product-line');
const stockProductSku = document.getElementById('stock-product-sku');
const stockProductIdInput = document.getElementById('stock-product-id');
const stockNewLocSelect = document.getElementById('stock-new-loc');
const stockNewQtyInput = document.getElementById('stock-new-qty');
const stockAddLocBtn = document.getElementById('stock-add-loc-btn');

// Tracks rows currently displayed in the modal:
//   { locationId, locationName, locationCode, currentQty, isNew }
let stockRowState = [];

async function openStockModal(productId) {
  const token = sessionStorage.getItem('token');
  stockErrorEl.style.display = 'none';
  stockErrorEl.textContent = '';
  stockRowsEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--fg-4);font-size:13px;">Loading…</div>';
  stockEmptyEl.style.display = 'none';
  stockProductIdInput.value = productId;
  stockModal.style.display = 'flex';

  try {
    const [prodRes, stockRes] = await Promise.all([
      fetch(`/api/products/${productId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(`/api/products/${productId}/stock`, { headers: { 'Authorization': `Bearer ${token}` } }),
    ]);
    const prodData = await prodRes.json();
    const stockData = await stockRes.json();
    if (!prodData.success) throw new Error(prodData.message || 'Failed to load product');
    if (!stockData.success) throw new Error(stockData.message || 'Failed to load stock');

    const p = prodData.data;
    stockProductLine.textContent = p.name;
    stockProductSku.textContent = p.current_sku || p.sku;

    // Show only locations where the product actually holds stock right
    // now (qty > 0). Drained zombie rows (qty=0 left behind by a transfer)
    // and locations the product has never been to both end up in the
    // "Add to another location" dropdown instead.
    const visibleLocationIds = new Set();
    stockRowState = (stockData.data || [])
      .filter((row) => Number(row.quantity || 0) > 0)
      .map((row) => {
        visibleLocationIds.add(String(row.location_id));
        return {
          locationId: row.location_id,
          locationName: row.location_name,
          locationCode: row.location_code,
          currentQty: Number(row.quantity || 0),
          isNew: false,
        };
      });
    renderStockRows();

    // Populate the "add to another location" dropdown with every other
    // location, so the user can extend the product into a location that
    // either has 0 (a drained zombie) or has never carried it before.
    stockNewLocSelect.innerHTML = '<option value="">Select location…</option>';
    locationsCache.forEach((l) => {
      if (!visibleLocationIds.has(String(l.id))) {
        stockNewLocSelect.add(new Option(`${l.name} (${l.code})`, l.id));
      }
    });
    stockNewQtyInput.value = '';
  } catch (err) {
    stockRowsEl.innerHTML = '';
    stockErrorEl.textContent = err.message || 'Could not load stock.';
    stockErrorEl.style.display = 'block';
  }
}

function renderStockRows() {
  if (stockRowState.length === 0) {
    stockRowsEl.innerHTML = '';
    stockEmptyEl.style.display = 'block';
    return;
  }
  stockEmptyEl.style.display = 'none';
  stockRowsEl.innerHTML = stockRowState.map((r, i) => `
    <div class="stock-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 80px;gap:12px;padding:10px 4px;align-items:center;border-bottom:1px solid var(--border);">
      <div>
        <div style="color:var(--fg-1);font-size:13px;">${escapeHtml(r.locationName || '—')}</div>
        <div class="mono" style="color:var(--fg-4);font-size:11px;">${escapeHtml(r.locationCode || '')}</div>
      </div>
      <div class="mono" style="text-align:right;color:var(--fg-2);">${r.currentQty}</div>
      <div>
        <input type="number" min="0" class="form-control stock-target-input" data-idx="${i}" value="${r.currentQty}" style="text-align:right;" />
      </div>
      <div class="mono stock-delta" data-idx="${i}" style="text-align:right;color:var(--fg-4);">0</div>
    </div>
  `).join('');

  stockRowsEl.querySelectorAll('.stock-target-input').forEach((input) => {
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.idx);
      const target = Number(input.value);
      const deltaEl = stockRowsEl.querySelector(`.stock-delta[data-idx="${idx}"]`);
      if (!deltaEl) return;
      if (!Number.isFinite(target)) {
        deltaEl.textContent = '—';
        deltaEl.style.color = 'var(--fg-4)';
        return;
      }
      const delta = target - stockRowState[idx].currentQty;
      deltaEl.textContent = delta > 0 ? `+${delta}` : String(delta);
      deltaEl.style.color = delta === 0 ? 'var(--fg-4)' : (delta > 0 ? 'var(--success)' : 'var(--danger)');
    });
  });
}

stockAddLocBtn.onclick = () => {
  stockErrorEl.style.display = 'none';
  const locId = stockNewLocSelect.value;
  const qty = parseInt(stockNewQtyInput.value, 10);
  if (!locId) {
    stockErrorEl.textContent = 'Pick a location to add this product to.';
    stockErrorEl.style.display = 'block';
    return;
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    stockErrorEl.textContent = 'Initial quantity must be a positive whole number.';
    stockErrorEl.style.display = 'block';
    return;
  }
  const loc = locationsCache.find((l) => String(l.id) === String(locId));
  if (!loc) return;
  // Inserts a new row that starts at currentQty=0; the typed quantity
  // becomes the target so the user can preview/edit the delta like the
  // existing rows. Keeps one source of truth for the submit.
  stockRowState.push({
    locationId: Number(locId),
    locationName: loc.name,
    locationCode: loc.code,
    currentQty: 0,
    isNew: true,
  });
  renderStockRows();
  // Pre-fill the input we just rendered with the user's target value so
  // the delta column reflects what they asked for immediately.
  const idx = stockRowState.length - 1;
  const input = stockRowsEl.querySelector(`.stock-target-input[data-idx="${idx}"]`);
  if (input) {
    input.value = qty;
    input.dispatchEvent(new Event('input'));
  }
  // Remove the chosen option from the dropdown so the user can't re-add it.
  [...stockNewLocSelect.options].forEach((o) => {
    if (o.value === locId) o.remove();
  });
  stockNewLocSelect.value = '';
  stockNewQtyInput.value = '';
};

document.getElementById('stock-cancel-btn').onclick = () => {
  stockModal.style.display = 'none';
};
stockModal.addEventListener('click', (e) => {
  if (e.target === stockModal) stockModal.style.display = 'none';
});

stockForm.onsubmit = async (e) => {
  e.preventDefault();
  stockErrorEl.style.display = 'none';
  const productId = stockProductIdInput.value;
  const token = sessionStorage.getItem('token');

  // Build the changes payload — only rows whose target differs from
  // current. Skip rows where the user entered the same value.
  const changes = [];
  stockRowsEl.querySelectorAll('.stock-target-input').forEach((input) => {
    const idx = Number(input.dataset.idx);
    const row = stockRowState[idx];
    const target = Number(input.value);
    if (!Number.isFinite(target) || target < 0 || !Number.isInteger(target)) {
      throw new Error('Quantities must be non-negative whole numbers.');
    }
    if (target !== row.currentQty) {
      changes.push({ location_id: row.locationId, target_quantity: target });
    }
  });

  if (changes.length === 0) {
    stockModal.style.display = 'none';
    return;
  }

  try {
    const res = await fetch(`/api/products/${productId}/adjust-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ changes }),
    });
    const data = await res.json();
    if (!data.success) {
      stockErrorEl.textContent = data.message || 'Could not save changes.';
      stockErrorEl.style.display = 'block';
      return;
    }
    stockModal.style.display = 'none';
    loadProducts();
  } catch (err) {
    stockErrorEl.textContent = 'Network error.';
    stockErrorEl.style.display = 'block';
  }
};

loadFilters();
loadProducts();
