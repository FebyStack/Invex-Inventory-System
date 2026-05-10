/**
 * role-guard.js — Permission-denied popup for non-admin users.
 *
 * Usage:
 *   1. On admin-only pages, set `<body data-admin-only>`. The guard auto-runs
 *      on DOMContentLoaded, blocks the page, and redirects to the dashboard.
 *   2. Anywhere else, call `Invex.denyAccess({ message })` to show the popup
 *      manually (e.g. on a 403 from the API or a click on a disabled action).
 */
(function () {
  'use strict';

  function getUser() {
    try { return JSON.parse(sessionStorage.getItem('user') || '{}'); }
    catch { return {}; }
  }

  function buildModal({ title, message, redirectTo }) {
    if (document.querySelector('.role-guard-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'role-guard-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
      <div class="role-guard-modal">
        <div class="role-guard-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>
        </div>
        <h2 class="role-guard-title">${title}</h2>
        <p class="role-guard-message">${message}</p>
        <div class="role-guard-actions">
          <button class="role-guard-btn primary" data-action="ok">
            ${redirectTo ? 'Back to Dashboard' : 'OK'}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
      overlay.remove();
      if (redirectTo) window.location.href = redirectTo;
    };

    overlay.querySelector('[data-action="ok"]').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        close();
      }
    });
  }

  function denyAccess(opts = {}) {
    buildModal({
      title: opts.title || 'Permission denied',
      message: opts.message || 'This action is restricted to administrators.',
      redirectTo: opts.redirectTo || null,
    });
  }

  function guardAdminOnlyPage() {
    if (!document.body.hasAttribute('data-admin-only')) return;
    const user = getUser();
    if (user.role === 'admin') return;

    // Hide page content immediately so staff don't see admin UI flash through.
    document.body.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      document.body.style.visibility = 'visible';
      buildModal({
        title: 'Admins only',
        message: 'You don’t have permission to view this page. You’ll be returned to the dashboard.',
        redirectTo: '/dashboard.html',
      });
    });
  }

  // ── Global fetch interceptor ──
  // Catches 403 responses from any /api/* call and shows the popup,
  // so staff get a friendly message whenever they hit a route they
  // don't have permission for (e.g. clicking "Add Location" as staff).
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (...args) {
    const response = await originalFetch(...args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (response.status === 403 && url.includes('/api/')) {
        // Try to read the server's message without consuming the body for the caller.
        const cloned = response.clone();
        let serverMsg = '';
        try {
          const data = await cloned.json();
          serverMsg = (data && data.message) || '';
        } catch { /* not JSON, ignore */ }

        denyAccess({
          title: 'Permission denied',
          message: serverMsg || 'This action is restricted to administrators.',
        });
      }
    } catch { /* never let the interceptor break the caller */ }
    return response;
  };

  // Public API
  window.Invex = window.Invex || {};
  window.Invex.denyAccess = denyAccess;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guardAdminOnlyPage);
  } else {
    guardAdminOnlyPage();
  }
})();
