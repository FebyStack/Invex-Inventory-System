/**
 * users.js — wired to /api/users (GET, POST, PUT, DELETE)
 * Backend response: { success, data: [{ id, username, full_name, email, role,
 *                       created_at, updated_at }] }
 */
(function () {
  'use strict';

  const token = sessionStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const list           = document.getElementById('users-list');
  const loadingState   = document.getElementById('loading-state');
  const noDataState    = document.getElementById('no-data-state');
  const modal          = document.getElementById('user-modal');
  const deleteModal    = document.getElementById('delete-modal');
  const form           = document.getElementById('user-form');
  const modalTitle     = document.getElementById('modal-title');
  const pwHint         = document.getElementById('pw-hint');

  const statTotal   = document.getElementById('stat-total');
  const statActive  = document.getElementById('stat-active');
  const statAdmins  = document.getElementById('stat-admins');
  const statStaff   = document.getElementById('stat-staff');
  const statTotalHint = document.getElementById('stat-total-hint');

  let deleteTargetId = null;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function initials(u) {
    const name = u.full_name || u.username || '?';
    return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }
  function timeSince(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min  = Math.floor(diff / 60000);
    if (min < 1)  return 'Now';
    if (min < 60) return `${min} min ago`;
    const h = Math.floor(min / 60);
    if (h < 24)   return `${h} hr ago`;
    const days = Math.floor(h / 24);
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${days >= 14 ? 's' : ''} ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function statusOf(u) {
    // We don't have a real "online" signal on the backend yet; infer from updated_at.
    const ts = u.updated_at || u.last_login || u.created_at;
    if (!ts) return 'offline';
    const ageHr = (Date.now() - new Date(ts).getTime()) / 3600000;
    if (ageHr < 0.25) return 'online';
    if (ageHr < 12)   return 'away';
    return 'offline';
  }

  function renderStats(users) {
    statTotal.textContent  = users.length;
    statTotalHint.textContent = users.length === 1 ? 'just one for now' : 'across the workspace';
    statActive.textContent = users.filter(u => statusOf(u) === 'online').length;
    statAdmins.textContent = users.filter(u => u.role === 'admin').length;
    statStaff.textContent  = users.filter(u => u.role === 'staff').length;
  }

  function render(users) {
    Array.from(list.querySelectorAll('.user-row')).forEach(n => n.remove());

    if (users.length === 0) {
      noDataState.style.display = '';
      loadingState.style.display = 'none';
      return;
    }
    noDataState.style.display = 'none';
    loadingState.style.display = 'none';

    users.forEach(u => {
      const status = statusOf(u);
      const roleColor = u.role === 'admin' ? 'var(--accent)' : 'var(--success)';
      const row = document.createElement('div');
      row.className = 'row user-row';
      row.style.gridTemplateColumns = '1fr 100px 120px 32px';
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="avatar-with-status">
            <div class="avatar-circle md">${escapeHtml(initials(u))}</div>
            <span class="status-dot ${status}"></span>
          </div>
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--fg-1);">${escapeHtml(u.full_name || u.username)}</div>
            <div style="font-size:11px;color:var(--fg-4);">${escapeHtml(u.email || '@' + u.username)}</div>
          </div>
        </div>
        <div class="mono" style="font-size:11px;color:${roleColor};letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(u.role)}</div>
        <div style="font-size:11px;color:var(--fg-4);">${escapeHtml(timeSince(u.updated_at || u.created_at))}</div>
        <div class="row-actions">
          <button class="action-btn edit-btn" data-id="${u.id}" title="Edit user">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      `;
      list.appendChild(row);
    });
  }

  async function loadUsers() {
    try {
      const res  = await fetch('/api/users', { headers });
      const data = await res.json();

      if (data.success) {
        const users = data.data || [];
        renderStats(users);
        render(users);
      } else {
        loadingState.textContent = data.message || 'Failed to load users.';
      }
    } catch {
      loadingState.textContent = 'Network error.';
    }
  }

  // ── Row actions (delegated, no inline onclick) ─────────
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('.action-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('edit-btn')) {
      try {
        const res = await fetch(`/api/users/${id}`, { headers });
        const data = await res.json();
        if (data.success && data.data) openEdit(data.data);
        else alert(data.message || 'Could not load user.');
      } catch { alert('Network error.'); }
    }
  });

  // ── Modal ──────────────────────────────────
  document.getElementById('new-user-btn').onclick = () => {
    form.reset();
    document.getElementById('edit-id').value = '';
    modalTitle.textContent = 'New user';
    document.getElementById('password').required = true;
    pwHint.textContent = '';
    modal.style.display = 'flex';
  };
  function openEdit(u) {
    document.getElementById('edit-id').value = u.id;
    document.getElementById('username').value = u.username;
    document.getElementById('full_name').value = u.full_name || '';
    document.getElementById('email').value = u.email || '';
    document.getElementById('role').value = u.role;
    document.getElementById('password').value = '';
    document.getElementById('password').required = false;
    pwHint.textContent = '(leave blank to keep current)';
    modalTitle.textContent = 'Edit user';
    modal.style.display = 'flex';
  }

  document.getElementById('cancel-btn').onclick = () => modal.style.display = 'none';
  document.getElementById('delete-cancel-btn').onclick = () => {
    deleteModal.style.display = 'none';
    deleteTargetId = null;
  };
  document.getElementById('delete-confirm-btn').onclick = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`/api/users/${deleteTargetId}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (data.success) {
        deleteModal.style.display = 'none';
        deleteTargetId = null;
        loadUsers();
      } else alert(data.message || 'Could not delete user.');
    } catch { alert('Network error.'); }
  };

  window.addEventListener('click', (e) => {
    if (e.target === modal)       modal.style.display = 'none';
    if (e.target === deleteModal) deleteModal.style.display = 'none';
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-id').value;
    const isEdit = Boolean(editId);

    const payload = {
      username:  document.getElementById('username').value.trim(),
      full_name: document.getElementById('full_name').value.trim(),
      email:     document.getElementById('email').value.trim(),
      role:      document.getElementById('role').value,
    };
    const pw = document.getElementById('password').value;
    if (pw) payload.password = pw;
    if (!isEdit && !pw) { alert('Password is required for new users.'); return; }

    try {
      const url    = isEdit ? `/api/users/${editId}` : '/api/users';
      const method = isEdit ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (data.success) {
        modal.style.display = 'none';
        form.reset();
        loadUsers();
      } else alert(data.message || 'Could not save user.');
    } catch { alert('Network error.'); }
  };

  loadUsers();
})();
