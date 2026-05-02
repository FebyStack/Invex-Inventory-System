/**
 * users.js
 * Users management page — CRUD with role badges.
 * Admin-only page.
 */
(function () {
  'use strict';

  const token = sessionStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  const tableBody = document.getElementById('users-table-body');
  const loadingState = document.getElementById('loading-state');
  const noDataState = document.getElementById('no-data-state');
  const modal = document.getElementById('user-modal');
  const deleteModal = document.getElementById('delete-modal');
  const form = document.getElementById('user-form');
  const modalTitle = document.getElementById('modal-title');
  const pwHint = document.getElementById('pw-hint');

  let deleteTargetId = null;

  // Load users
  async function loadUsers() {
    try {
      const res = await fetch('/api/users', { headers });
      const data = await res.json();

      loadingState.style.display = 'none';

      if (data.success && data.data.length > 0) {
        tableBody.innerHTML = '';
        data.data.forEach(user => {
          const roleClass = user.role === 'admin' ? 'role-admin' : 'role-staff';
          const joined = new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const initials = (user.full_name || user.username).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--surface-elev);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:11px;color:var(--fg-1);flex-shrink:0">${initials}</div>
                <div>
                  <div style="font-weight:500;color:var(--fg-1)">${user.full_name || '-'}</div>
                  <div style="font-size:11px;color:var(--fg-4);font-family:'DM Mono',monospace">@${user.username}</div>
                </div>
              </div>
            </td>
            <td style="color:var(--fg-2)">${user.email || '-'}</td>
            <td><span class="role-badge ${roleClass}">${user.role}</span></td>
            <td style="color:var(--fg-3)">${joined}</td>
            <td style="text-align:right">
              <button class="action-btn" title="Edit" onclick="editUser(${user.id})">✎</button>
              <button class="action-btn" title="Delete" onclick="confirmDelete(${user.id})" style="color:var(--danger)">✕</button>
            </td>
          `;
          tableBody.appendChild(tr);
        });
      } else {
        noDataState.style.display = 'block';
      }
    } catch (err) {
      console.error('Error loading users:', err);
      loadingState.textContent = 'Failed to load users.';
    }
  }

  // Open modal for new user
  document.getElementById('new-user-btn').onclick = () => {
    form.reset();
    document.getElementById('edit-id').value = '';
    modalTitle.textContent = 'New user';
    document.getElementById('password').required = true;
    pwHint.textContent = '';
    modal.style.display = 'flex';
  };

  // Edit user
  window.editUser = async (id) => {
    try {
      const res = await fetch(`/api/users/${id}`, { headers });
      const data = await res.json();
      if (data.success && data.data) {
        const u = data.data;
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
    } catch (err) {
      alert('Error loading user details.');
    }
  };

  // Delete confirmation
  window.confirmDelete = (id) => {
    deleteTargetId = id;
    deleteModal.style.display = 'flex';
  };

  document.getElementById('delete-cancel-btn').onclick = () => {
    deleteModal.style.display = 'none';
    deleteTargetId = null;
  };

  document.getElementById('delete-confirm-btn').onclick = async () => {
    if (!deleteTargetId) return;
    try {
      const res = await fetch(`/api/users/${deleteTargetId}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (data.success) {
        deleteModal.style.display = 'none';
        deleteTargetId = null;
        loadUsers();
      } else {
        alert('Error: ' + data.message);
      }
    } catch (err) {
      alert('Network error. Please try again.');
    }
  };

  // Cancel / close modal
  document.getElementById('cancel-btn').onclick = () => modal.style.display = 'none';
  window.onclick = (e) => {
    if (e.target === modal) modal.style.display = 'none';
    if (e.target === deleteModal) deleteModal.style.display = 'none';
  };

  // Form submit
  form.onsubmit = async (e) => {
    e.preventDefault();
    const editId = document.getElementById('edit-id').value;
    const isEdit = !!editId;

    const payload = {
      username: document.getElementById('username').value.trim(),
      full_name: document.getElementById('full_name').value.trim(),
      email: document.getElementById('email').value.trim(),
      role: document.getElementById('role').value,
    };

    const pw = document.getElementById('password').value;
    if (pw) payload.password = pw;

    if (!isEdit && !pw) {
      alert('Password is required for new users.');
      return;
    }

    try {
      const url = isEdit ? `/api/users/${editId}` : '/api/users';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        modal.style.display = 'none';
        form.reset();
        loadUsers();
      } else {
        alert('Error: ' + data.message);
      }
    } catch (err) {
      alert('Network error. Please try again.');
    }
  };

  loadUsers();
})();
