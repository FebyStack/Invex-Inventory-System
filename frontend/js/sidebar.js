/**
 * sidebar.js — Invex Sidebar Navigation Controller
 * Handles: active link highlighting, page navigation, logout, theme toggle
 */
(function () {
  'use strict';

  // ── Theme: apply persisted theme ASAP to avoid flash ──
  const applyTheme = (theme) => {
    if (theme === 'light') document.body.classList.add('light');
    else document.body.classList.remove('light');
    try { localStorage.setItem('invex_theme', theme); } catch {}
  };
  const storedTheme = (() => { try { return localStorage.getItem('invex_theme'); } catch { return null; } })();
  applyTheme(storedTheme || 'dark');

  // Map nav labels to their page URLs
  const navMap = {
    'Dashboard': '/dashboard.html',
    'Products': '/products.html',
    'Categories': '/categories.html',
    'Suppliers': '/suppliers.html',
    'Locations': '/locations.html',
    'Batches': '/batches.html',
    'Orders': '/orders.html',
    'Adjustments': '/adjustments.html',
    'Reports': '/reports.html',
    'Import/Export': '/import-export.html',
    'Users': '/users.html'
  };

  // 1. Highlight current page in sidebar
  const currentPath = window.location.pathname;
  const navItems = document.querySelectorAll('.nav-item');

  navItems.forEach((item) => {
    const label = item.querySelector('.nav-label');
    if (!label) return;

    const text = label.textContent.trim();
    const targetPath = navMap[text];

    item.classList.remove('active');
    if (targetPath && currentPath.endsWith(targetPath)) {
      item.classList.add('active');
    }
  });

  // 2. Handle nav clicks — navigate to the page
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const label = item.querySelector('.nav-label');
      if (!label) return;
      const text = label.textContent.trim();
      const targetPath = navMap[text];
      if (targetPath) window.location.href = targetPath;
    });
  });

  // 3. Inject theme toggle just above the sidebar-footer
  const footer = document.querySelector('.sidebar-footer');
  if (footer && !document.querySelector('.theme-toggle')) {
    const toggle = document.createElement('div');
    toggle.className = 'theme-toggle';
    toggle.innerHTML = `
      <button data-theme="dark" title="Dark mode">
        <svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <span class="toggle-label">Dark</span>
      </button>
      <button data-theme="light" title="Light mode">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        <span class="toggle-label">Light</span>
      </button>
    `;
    footer.parentNode.insertBefore(toggle, footer);

    const setActive = () => {
      const cur = document.body.classList.contains('light') ? 'light' : 'dark';
      toggle.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === cur);
      });
    };
    setActive();

    toggle.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        applyTheme(b.dataset.theme);
        setActive();
      });
    });
  }

  // 4. Handle logout button
  const logoutBtn = document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const token = sessionStorage.getItem('token');
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.error('Logout API error:', err);
      } finally {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        window.location.href = '/login.html';
      }
    });
  }

  // 5. Session guard
  if (!sessionStorage.getItem('token')) {
    window.location.href = '/login.html';
  }

  // 6. Display user initials and info in footer
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');

  const avatar = document.getElementById('sidebar-avatar');
  const nameLabel = document.getElementById('sidebar-name');
  const roleLabel = document.getElementById('sidebar-role');

  if (user.full_name) {
    if (avatar) avatar.textContent = user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    if (nameLabel) nameLabel.textContent = user.full_name;
  } else if (user.username) {
    if (avatar) avatar.textContent = user.username.substring(0, 2).toUpperCase();
    if (nameLabel) nameLabel.textContent = user.username;
  }

  if (roleLabel && user.role) {
    roleLabel.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  }

  // 7. Admin Section Guard
  if (user.role === 'admin') {
    const divider = document.getElementById('admin-divider');
    const label = document.getElementById('admin-label');
    if (divider) divider.style.display = 'block';
    if (label) label.style.display = 'block';
    document.querySelectorAll('.admin-item').forEach(el => el.style.display = 'flex');
  }
})();
