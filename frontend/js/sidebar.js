/**
 * sidebar.js — Invex Sidebar Navigation Controller
 * Handles: active link highlighting, page navigation, logout
 */
(function () {
  'use strict';

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

    // Remove active from all
    item.classList.remove('active');

    // Set active on match
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

      if (targetPath) {
        window.location.href = targetPath;
      }
    });
  });

  // 3. Handle logout button
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

  // 4. Session guard — redirect unauthenticated users
  if (!sessionStorage.getItem('token')) {
    window.location.href = '/login.html';
  }

  // 5. Display user initials and info in footer
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

  // 6. Admin Section Guard
  if (user.role === 'admin') {
    document.getElementById('admin-divider').style.display = 'block';
    document.getElementById('admin-label').style.display = 'block';
    document.querySelectorAll('.admin-item').forEach(el => el.style.display = 'flex');
  }
})();
