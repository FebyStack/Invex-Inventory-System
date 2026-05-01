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
  if (!show) expiryDateInput.value = '';
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
                <span class="product-name">${p.name}</span>
                <span class="product-sku">${p.sku}</span>
              </div>
            </div>
          </td>
          <td style="color:var(--fg-3);">${p.category_name || '—'}</td>
          <td style="text-align:right;font-family:'DM Mono',monospace;color:var(--fg-2);">₱${parseFloat(p.unit_price).toFixed(2)}</td>
          <td><span class="stock-badge stock-in">Fetching…</span></td>
          <td style="text-align:right;">
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
  trackExpiryCheckbox.checked = true;
  expiryDateInput.value = '';
  toggleExpiryDate();
  updatePickerLabel();
  renderLocationOptions();
  updateSkuPreview();
  modal.style.display = 'flex';
};

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
  const basePayload = {
    name: document.getElementById('name').value,
    category_id: parseInt(document.getElementById('category_id').value),
    supplier_id: document.getElementById('supplier_id').value ? parseInt(document.getElementById('supplier_id').value) : null,
    unit_price: parseFloat(document.getElementById('unit_price').value),
    reorder_level: parseInt(document.getElementById('reorder_level').value),
    unit_of_measure: document.getElementById('unit_of_measure').value,
    track_expiry: trackExpiry
  };
  if (trackExpiry && expiryDateInput.value) {
    basePayload.expiry_date = expiryDateInput.value;
  }

  if (isEdit) {
    // Edit mode — single PUT, no location change
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(basePayload)
      });
      const result = await res.json();
      if (result.success) {
        modal.style.display = 'none';
        loadProducts();
      } else {
        alert('Error: ' + result.message);
      }
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

// ── Table actions (edit / delete) ────────────────────────
tableBody.onclick = async (e) => {
  if (e.target.classList.contains('delete-btn')) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    const id = e.target.dataset.id;
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if ((await res.json()).success) loadProducts();
  }

  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.dataset.id;
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/api/products/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      const p = data.data;
      document.getElementById('edit-id').value = p.id;
      document.getElementById('name').value = p.name;
      // Show stock row but make it read-only for editing (since it's a sum)
      const qtyRow = document.getElementById('initial-qty-row');
      const qtyInput = document.getElementById('initial_quantity');
      const qtyLabel = qtyRow.querySelector('label');
      qtyRow.style.display = '';
      qtyLabel.textContent = 'Current stock';
      qtyInput.value = p.total_stock || 0;
      qtyInput.readOnly = true;
      qtyInput.style.opacity = '0.7';

      updateSkuPreview(p.sku);
      document.getElementById('category_id').value = p.category_id;
      document.getElementById('supplier_id').value = p.supplier_id || '';
      document.getElementById('unit_price').value = p.unit_price;
      document.getElementById('reorder_level').value = p.reorder_level;
      document.getElementById('unit_of_measure').value = p.unit_of_measure || 'pcs';
      document.getElementById('track_expiry').checked = p.track_expiry;
      expiryDateInput.value = '';
      toggleExpiryDate();
      // On edit, hide the expiry date input — expiry is managed per-batch
      expiryDateGroup.style.display = 'none';

      document.getElementById('modal-title').textContent = 'Edit product';
      modal.style.display = 'flex';
    }
  }
}

loadFilters();
loadProducts();
