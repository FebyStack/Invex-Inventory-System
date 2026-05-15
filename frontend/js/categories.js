// ============================================
// Categories — card grid (Invex Dark redesign)
// Backend communicates: GET /api/categories returns name, description,
// color, product_count, total_value — no separate /api/products fetch needed.
// ============================================

const grid          = document.getElementById('cat-grid');
const loadingState  = document.getElementById('loading-state');
const emptyState    = document.getElementById('empty-state');
const modal         = document.getElementById('category-modal');
const form          = document.getElementById('category-form');
const searchInput   = document.getElementById('search-input');
const countEl       = document.getElementById('cat-count');
const colorPickerEl = document.getElementById('color-picker');

let categoriesCache = [];

// Palette mirrors the dark-mode design spec.
const PALETTE = [
  '#7C7CFF', // indigo
  '#5EEAD4', // teal
  '#FBBF24', // amber
  '#F472B6', // pink
  '#A78BFA', // violet
  '#F87171', // red (accent)
  '#4ADE80', // green
  '#60A5FA', // blue
];
const DEFAULT_COLOR = PALETTE[0];

// Use the server-provided color, fall back to a deterministic palette pick
// keyed off the name so legacy rows without a color still look right.
function colorFor(cat) {
  if (cat.color) return cat.color;
  let h = 0;
  for (const ch of (cat.name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Derive a small SKU label from the name: "Electronics" → "CAT-EL"
function skuFor(name) {
  const letters = String(name || '').toUpperCase().replace(/[^A-Z]/g, '');
  return 'CAT-' + (letters.slice(0, 2) || 'XX');
}

// Format PHP value
function formatValue(v) {
  const n = Number(v) || 0;
  if (!n) return '₱0';
  if (n >= 1000) return '₱' + Math.round(n).toLocaleString();
  return '₱' + n.toFixed(0);
}

// ── Data load ───────────────────────────────────
async function loadCategories() {
  const token = sessionStorage.getItem('token');
  loadingState.style.display = '';
  grid.style.display = 'none';
  emptyState.style.display = 'none';

  try {
    const res = await fetch('/api/categories', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    categoriesCache = (data.success && (data.categories || data.data)) || [];
    renderGrid();
  } catch (err) {
    loadingState.textContent = 'Failed to load categories.';
  }
}

// ── Render ──────────────────────────────────────
function renderGrid() {
  loadingState.style.display = 'none';

  const q = searchInput.value.toLowerCase().trim();
  const filtered = q
    ? categoriesCache.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q))
    : categoriesCache;

  countEl.textContent = filtered.length;

  if (categoriesCache.length === 0) {
    emptyState.style.display = '';
    grid.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  grid.style.display = '';
  grid.innerHTML = '';

  filtered.forEach(c => {
    const color = colorFor(c);
    const items = Number(c.product_count ?? 0);
    const value = Number(c.total_value ?? 0);

    const card = document.createElement('div');
    card.className = 'cat-card';
    card.dataset.id = c.id;
    card.innerHTML = `
      <div class="cat-actions">
        <button class="action-btn edit-btn" data-id="${c.id}" title="Edit category">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="action-btn danger delete-btn" data-id="${c.id}" title="Delete category">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

      <div class="cat-card-head">
        <div class="cat-icon" style="background:${color}22;color:${color};">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>
        </div>
        <span class="cat-sku">${skuFor(c.name)}</span>
      </div>

      <div class="cat-name">${escapeHtml(c.name)}</div>
      <div class="cat-desc">${escapeHtml(c.description || '—')}</div>

      <div class="cat-stats">
        <div class="cat-stat">
          <div class="cat-stat-label">Items</div>
          <div class="cat-stat-value">${items}</div>
        </div>
        <div class="cat-stat right">
          <div class="cat-stat-label">Value</div>
          <div class="cat-stat-value">${formatValue(value)}</div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Always-visible "+ New category" placeholder card at the end
  const addCard = document.createElement('div');
  addCard.className = 'cat-card add';
  addCard.id = 'cat-add-card';
  addCard.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <div class="label">New category</div>
  `;
  grid.appendChild(addCard);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Color picker ─────────────────────────────────
let selectedColor = DEFAULT_COLOR;

function renderColorPicker(active) {
  selectedColor = active || DEFAULT_COLOR;
  // Ensure the active swatch is selectable even if it isn't in the palette.
  const colors = PALETTE.includes(selectedColor) ? PALETTE : [...PALETTE, selectedColor];
  colorPickerEl.innerHTML = '';
  colors.forEach(c => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'swatch' + (c === selectedColor ? ' selected' : '');
    sw.style.background = c;
    sw.dataset.color = c;
    sw.onclick = () => {
      selectedColor = c;
      [...colorPickerEl.children].forEach(el => el.classList.remove('selected'));
      sw.classList.add('selected');
    };
    colorPickerEl.appendChild(sw);
  });
}

// ── Search ──────────────────────────────────────
searchInput.oninput = renderGrid;

// ── Modal open/close ────────────────────────────
function openModal({ edit = null } = {}) {
  form.reset();
  if (edit) {
    document.getElementById('edit-id').value = edit.id;
    document.getElementById('cat-name').value = edit.name;
    document.getElementById('cat-description').value = edit.description || '';
    document.getElementById('modal-title').textContent = 'Edit category';
    renderColorPicker(colorFor(edit));
  } else {
    document.getElementById('edit-id').value = '';
    document.getElementById('modal-title').textContent = 'New category';
    renderColorPicker(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  }
  modal.style.display = 'flex';
}
function closeModal() { modal.style.display = 'none'; }

document.getElementById('new-category-btn').onclick = () => openModal();
document.getElementById('cancel-btn').onclick = closeModal;
modal.onclick = (e) => { if (e.target === modal) closeModal(); };
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.style.display === 'flex') closeModal();
});

// ── Form submit ─────────────────────────────────
form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  const id = document.getElementById('edit-id').value;
  const isEdit = Boolean(id);

  const payload = {
    name:        document.getElementById('cat-name').value.trim(),
    description: document.getElementById('cat-description').value.trim() || null,
    color:       selectedColor,
  };

  if (!payload.name) return;

  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await fetch(isEdit ? `/api/categories/${id}` : '/api/categories', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) {
      closeModal();
      loadCategories();
    } else {
      showAlert({
        title: 'Save Failed',
        text: result.message || 'Could not save category.',
        type: 'danger'
      });
    }
  } catch (err) {
    showAlert({ title: 'Network Error', text: 'Failed to connect to the server.', type: 'danger' });
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
};

// ── Card click handlers ─────────────────────────
grid.onclick = async (e) => {
  // "+ New category" card
  if (e.target.closest('#cat-add-card')) {
    openModal();
    return;
  }

  const btn = e.target.closest('.action-btn');
  if (btn) {
    e.stopPropagation();
    const id = btn.dataset.id;
    const token = sessionStorage.getItem('token');

    if (btn.classList.contains('delete-btn')) {
      const confirmed = await showConfirm({
        title: 'Delete Category',
        text: 'Are you sure you want to delete this category? This action cannot be undone.',
        confirmText: 'Delete',
        type: 'danger'
      });
      if (!confirmed) return;

      try {
        const res = await fetch(`/api/categories/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const result = await res.json();
        if (result.success) {
          loadCategories();
        } else {
          showAlert({
            title: 'Delete Failed',
            text: result.message || 'Could not delete category.',
            type: 'danger'
          });
        }
      } catch { 
        showAlert({ title: 'Network Error', text: 'Failed to connect to the server.', type: 'danger' });
      }
      return;
    }

    if (btn.classList.contains('edit-btn')) {
      const cat = categoriesCache.find(c => String(c.id) === String(id));
      if (cat) openModal({ edit: cat });
      return;
    }
  }

  // Click anywhere else on the card → edit
  const card = e.target.closest('.cat-card:not(.add)');
  if (card) {
    const cat = categoriesCache.find(c => String(c.id) === String(card.dataset.id));
    if (cat) openModal({ edit: cat });
  }
};

// ── Initial load ────────────────────────────────
loadCategories();
