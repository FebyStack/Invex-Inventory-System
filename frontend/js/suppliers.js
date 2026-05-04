// Suppliers — wired to /api/suppliers (GET, POST, PUT, DELETE)
// Backend response shape: { success, count, suppliers: [...] }
//   each row: { id, name, contact_person, phone, email, address_line, barangay, city, province, postal_code, created_at }

const tableBody     = document.getElementById('suppliers-table-body');
const loadingState  = document.getElementById('loading-state');
const emptyState    = document.getElementById('empty-state');
const modal         = document.getElementById('supplier-modal');
const form          = document.getElementById('supplier-form');
const searchInput   = document.getElementById('search-input');
const filteredCount = document.getElementById('filtered-count');
const totalCount    = document.getElementById('total-count');

let suppliersCache = [];

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function initialsOf(name) {
  return String(name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

async function loadSuppliers() {
  const token = sessionStorage.getItem('token');
  try {
    const res = await fetch('/api/suppliers', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();

    if (data.success) {
      suppliersCache = data.suppliers || data.data || [];
      renderTable();
    } else if (loadingState) {
      loadingState.querySelector('td').textContent = data.message || 'Failed to load suppliers.';
    }
  } catch (err) {
    if (loadingState) loadingState.querySelector('td').textContent = 'Network error.';
  }
}

function renderTable() {
  const q = searchInput.value.toLowerCase().trim();
  const filtered = q
    ? suppliersCache.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.contact_person || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q))
    : suppliersCache;

  filteredCount.textContent = filtered.length;
  totalCount.textContent = suppliersCache.length;

  tableBody.innerHTML = '';

  if (suppliersCache.length === 0) {
    emptyState.style.display = '';
    return;
  }
  emptyState.style.display = 'none';

  filtered.forEach(s => {
    const loc = [s.city, s.province].filter(Boolean).join(', ') || '—';
    const code = `SUP-${String(s.id).padStart(3, '0')}`;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="avatar-circle">${escapeHtml(initialsOf(s.name))}</div>
          <div>
            <div class="name">${escapeHtml(s.name)}</div>
            <div class="sub">${code}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="color:var(--fg-1);font-size:13px;">${escapeHtml(s.contact_person || '—')}</div>
        <div style="color:var(--fg-4);font-size:11px;">${escapeHtml(s.email || '')}</div>
      </td>
      <td class="muted">${escapeHtml(loc)}</td>
      <td class="mono" style="font-size:12px;color:var(--fg-3);">${escapeHtml(s.phone || '—')}</td>
      <td class="right">
        <div class="row-actions">
          <button class="action-btn edit-btn" data-id="${s.id}" title="Edit supplier">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="action-btn delete-btn" data-id="${s.id}" title="Delete supplier">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// ── Search ───────────────────────────────────────────────
searchInput.oninput = renderTable;

// ── Modal ────────────────────────────────────────────────
function openModal(supplier) {
  form.reset();
  if (supplier) {
    document.getElementById('edit-id').value = supplier.id;
    document.getElementById('sup-name').value = supplier.name || '';
    document.getElementById('sup-contact').value = supplier.contact_person || '';
    document.getElementById('sup-phone').value = supplier.phone || '';
    document.getElementById('sup-email').value = supplier.email || '';
    document.getElementById('sup-address').value = supplier.address_line || '';
    document.getElementById('sup-barangay').value = supplier.barangay || '';
    document.getElementById('sup-city').value = supplier.city || '';
    document.getElementById('sup-province').value = supplier.province || '';
    document.getElementById('sup-postal').value = supplier.postal_code || '';
    document.getElementById('modal-title').textContent = 'Edit supplier';
  } else {
    document.getElementById('edit-id').value = '';
    document.getElementById('modal-title').textContent = 'New supplier';
  }
  modal.style.display = 'flex';
}
function closeModal() { modal.style.display = 'none'; }

document.getElementById('new-supplier-btn').onclick = () => openModal();
document.getElementById('cancel-btn').onclick = closeModal;
modal.onclick = (e) => { if (e.target === modal) closeModal(); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
});

// ── Form submit (POST/PUT to /api/suppliers) ────────────
form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  const id = document.getElementById('edit-id').value;
  const isEdit = Boolean(id);

  const payload = {
    name:           document.getElementById('sup-name').value.trim(),
    contact_person: document.getElementById('sup-contact').value.trim() || null,
    phone:          document.getElementById('sup-phone').value.trim() || null,
    email:          document.getElementById('sup-email').value.trim() || null,
    address_line:   document.getElementById('sup-address').value.trim() || null,
    barangay:       document.getElementById('sup-barangay').value.trim() || null,
    city:           document.getElementById('sup-city').value.trim() || null,
    province:       document.getElementById('sup-province').value.trim() || null,
    postal_code:    document.getElementById('sup-postal').value.trim() || null,
  };
  if (!payload.name) return;

  try {
    const res = await fetch(isEdit ? `/api/suppliers/${id}` : '/api/suppliers', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) { closeModal(); loadSuppliers(); }
    else alert(result.message || 'Could not save supplier.');
  } catch { alert('Network error.'); }
};

// ── Table row actions (edit/delete via /api/suppliers/:id) ──
tableBody.onclick = async (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  e.stopPropagation();
  const id = btn.dataset.id;
  const token = sessionStorage.getItem('token');

  if (btn.classList.contains('delete-btn')) {
    if (!confirm("Delete this supplier? Existing products won't be affected.")) return;
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success) loadSuppliers();
      else alert(result.message || 'Could not delete supplier.');
    } catch { alert('Network error.'); }
    return;
  }

  if (btn.classList.contains('edit-btn')) {
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && (data.supplier || data.data)) openModal(data.supplier || data.data);
      else alert(data.message || 'Could not load supplier.');
    } catch { alert('Network error.'); }
  }
};

loadSuppliers();
