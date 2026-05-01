const tableBody = document.getElementById('suppliers-table-body');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const modal = document.getElementById('supplier-modal');
const form = document.getElementById('supplier-form');
const searchInput = document.getElementById('search-input');

let suppliersCache = [];

async function loadSuppliers() {
  const token = sessionStorage.getItem('token');
  try {
    const res = await fetch('/api/suppliers', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    loadingState.style.display = 'none';

    if (data.success) {
      suppliersCache = data.suppliers || [];
      renderTable();
    }
  } catch (err) {
    loadingState.querySelector('td').textContent = 'Failed to load suppliers.';
  }
}

function renderTable() {
  const query = searchInput.value.toLowerCase().trim();
  const filtered = query
    ? suppliersCache.filter(s =>
        s.name.toLowerCase().includes(query) ||
        (s.contact_person || '').toLowerCase().includes(query) ||
        (s.email || '').toLowerCase().includes(query) ||
        (s.city || '').toLowerCase().includes(query)
      )
    : suppliersCache;

  tableBody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = '';
    return;
  }

  emptyState.style.display = 'none';

  filtered.forEach(s => {
    const row = document.createElement('tr');
    const locationParts = [s.city, s.province].filter(Boolean);
    const locationStr = locationParts.length ? locationParts.join(', ') : '—';

    row.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="width:28px;height:28px;border-radius:5px;background:var(--surface);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center;color:var(--fg-4);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm12 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm-1.5-8.5l1.96 2.5H17V10h-.5z"/></svg>
          </span>
          <span style="font-weight:500;color:var(--fg-1);">${s.name}</span>
        </div>
      </td>
      <td style="color:var(--fg-3);">${s.contact_person || '—'}</td>
      <td style="color:var(--fg-3);font-family:'DM Mono',monospace;font-size:12px;">${s.phone || '—'}</td>
      <td style="color:var(--fg-3);font-size:12px;">${s.email || '—'}</td>
      <td style="color:var(--fg-4);font-size:12px;">${locationStr}</td>
      <td style="text-align:right;">
        <button class="action-btn edit-btn" data-id="${s.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="action-btn delete-btn" data-id="${s.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// ── Search ───────────────────────────────────────────────
searchInput.oninput = renderTable;

// ── Modal ────────────────────────────────────────────────
document.getElementById('new-supplier-btn').onclick = () => {
  form.reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('modal-title').textContent = 'New supplier';
  modal.style.display = 'flex';
};

document.getElementById('cancel-btn').onclick = () => {
  modal.style.display = 'none';
};

// ── Form submit ──────────────────────────────────────────
form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  const id = document.getElementById('edit-id').value;
  const isEdit = Boolean(id);

  const payload = {
    name: document.getElementById('sup-name').value,
    contact_person: document.getElementById('sup-contact').value || null,
    phone: document.getElementById('sup-phone').value || null,
    email: document.getElementById('sup-email').value || null,
    address_line: document.getElementById('sup-address').value || null,
    barangay: document.getElementById('sup-barangay').value || null,
    city: document.getElementById('sup-city').value || null,
    province: document.getElementById('sup-province').value || null,
    postal_code: document.getElementById('sup-postal').value || null
  };

  try {
    const res = await fetch(isEdit ? `/api/suppliers/${id}` : '/api/suppliers', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      modal.style.display = 'none';
      loadSuppliers();
    } else {
      alert('Error: ' + result.message);
    }
  } catch (err) { alert('Network error.'); }
};

// ── Table actions ────────────────────────────────────────
tableBody.onclick = async (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  const token = sessionStorage.getItem('token');

  if (btn.classList.contains('delete-btn')) {
    if (!confirm('Delete this supplier? Existing products won\'t be affected.')) return;
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if ((await res.json()).success) loadSuppliers();
    } catch (err) { alert('Network error.'); }
  }

  if (btn.classList.contains('edit-btn')) {
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        const s = data.supplier;
        document.getElementById('edit-id').value = s.id;
        document.getElementById('sup-name').value = s.name;
        document.getElementById('sup-contact').value = s.contact_person || '';
        document.getElementById('sup-phone').value = s.phone || '';
        document.getElementById('sup-email').value = s.email || '';
        document.getElementById('sup-address').value = s.address_line || '';
        document.getElementById('sup-barangay').value = s.barangay || '';
        document.getElementById('sup-city').value = s.city || '';
        document.getElementById('sup-province').value = s.province || '';
        document.getElementById('sup-postal').value = s.postal_code || '';
        document.getElementById('modal-title').textContent = 'Edit supplier';
        modal.style.display = 'flex';
      }
    } catch (err) { alert('Network error.'); }
  }
};

loadSuppliers();
