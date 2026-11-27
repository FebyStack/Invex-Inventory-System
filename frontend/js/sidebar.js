/**
 * Common Invex Navigation & Role-Based UI Access Controller
 * Author: Lev
 * Dynamically toggles navigation visibility based on active user role.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Retrieve authentication context
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');

  let user = null;
  try {
    user = userJson ? JSON.parse(userJson) : null;
  } catch (e) {}

  // Set Profile Avatar & Initials if present
  const avatarEl = document.getElementById('user-avatar');
  if (avatarEl && user) {
    const initials = (user.full_name || user.username || 'U')
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
    avatarEl.textContent = initials;
    avatarEl.title = `${user.full_name || user.username} (${user.role || 'user'})`;
  }

  // Role-Based UI Restrictions
  const role = user ? (user.role || '').toLowerCase() : '';
  const isSuperAdmin = role === 'super_admin' || role === 'admin';

  // Toggle Admin-only Navigation Elements
  const navUsers = document.getElementById('nav-users');
  const navAudit = document.getElementById('nav-audit');

  if (navUsers) {
    navUsers.style.display = isSuperAdmin ? 'flex' : 'none';
  }

  if (navAudit) {
    navAudit.style.display = isSuperAdmin ? 'flex' : 'none';
  }

  // Hide Super Admin actions in action tables (e.g. Delete Product button)
  if (!isSuperAdmin) {
    document.querySelectorAll('.super-admin-only, [data-role="super_admin"]').forEach(el => {
      el.style.display = 'none';
    });
  }

  // Handle Logout
  const logoutBtn = document.getElementById('logout-btn') || document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = '/login.html';
    });
  }
});
