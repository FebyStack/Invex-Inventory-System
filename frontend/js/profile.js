/**
 * profile.js
 * Shows current user info and handles change password.
 */
(function () {
  'use strict';

  const token = sessionStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Load user profile
  async function loadProfile() {
    try {
      const res = await fetch('/api/auth/me', { headers });
      const data = await res.json();

      if (data.success && data.user) {
        const u = data.user;
        const initials = (u.full_name || u.username).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        document.getElementById('profile-avatar').textContent = initials;
        document.getElementById('p-username').textContent = u.username;
        document.getElementById('p-fullname').textContent = u.full_name || '-';
        document.getElementById('p-email').textContent = u.email || '-';

        const roleEl = document.getElementById('p-role');
        const roleClass = u.role === 'admin' ? 'role-admin' : 'role-staff';
        roleEl.innerHTML = `<span class="role-badge ${roleClass}">${u.role}</span>`;

        if (u.created_at) {
          document.getElementById('p-joined').textContent = new Date(u.created_at).toLocaleDateString('en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
          });
        }
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  }

  // Change password form
  const form = document.getElementById('password-form');
  const pwMsg = document.getElementById('pw-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPw = document.getElementById('current_password').value;
    const newPw = document.getElementById('new_password').value;
    const confirmPw = document.getElementById('confirm_password').value;

    pwMsg.className = 'pw-msg';
    pwMsg.style.display = 'none';

    if (newPw !== confirmPw) {
      pwMsg.textContent = 'New passwords do not match.';
      pwMsg.className = 'pw-msg error';
      return;
    }

    if (newPw.length < 6) {
      pwMsg.textContent = 'Password must be at least 6 characters.';
      pwMsg.className = 'pw-msg error';
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          current_password: currentPw,
          new_password: newPw
        })
      });

      const data = await res.json();

      if (data.success) {
        pwMsg.textContent = '✓ Password changed successfully.';
        pwMsg.className = 'pw-msg success';
        form.reset();
      } else {
        pwMsg.textContent = data.message || 'Failed to change password.';
        pwMsg.className = 'pw-msg error';
      }
    } catch (err) {
      pwMsg.textContent = 'Network error. Please try again.';
      pwMsg.className = 'pw-msg error';
    }
  });

  loadProfile();
})();
