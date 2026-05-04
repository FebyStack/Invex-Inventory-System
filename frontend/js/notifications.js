/**
 * notifications.js — bell dropdown for low-stock + expiring-batch alerts.
 *
 * Wires every header bell on the page (button.icon-btn[title="Notifications"]).
 * Polls /api/notifications every 60s; clicking an item marks it read and
 * routes to the linked page. The bell's red dot is driven by unread count,
 * not the static markup.
 */
(function () {
  'use strict';

  const token = sessionStorage.getItem('token');
  if (!token) return;
  const headers = { 'Authorization': `Bearer ${token}` };

  const POLL_MS = 60_000;

  const TYPE_LABEL = {
    LOW_STOCK: 'Low stock',
    OUT_OF_STOCK: 'Out of stock',
    EXPIRING_BATCH: 'Expiring batch',
    EXPIRED_BATCH: 'Expired batch',
  };

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function timeAgo(date) {
    const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  // ── State ──
  let cache = [];
  const bells = []; // [{ btn, panel, listEl, clearBtn }]

  function buildPanel(btn) {
    // Wrap the bell so the panel can anchor to it.
    const wrap = document.createElement('span');
    wrap.className = 'notif-anchor';
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'notif-panel';
    panel.innerHTML = `
      <div class="notif-header">
        <span class="title">Notifications</span>
        <button class="clear-btn" type="button" disabled>Mark all read</button>
      </div>
      <div class="notif-list"><div class="notif-loading">Loading…</div></div>
    `;
    wrap.appendChild(panel);
    const listEl = panel.querySelector('.notif-list');
    const clearBtn = panel.querySelector('.clear-btn');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      // Close any others, then toggle this one.
      bells.forEach((b) => b.panel.classList.remove('open'));
      if (!isOpen) panel.classList.add('open');
    });

    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await fetch('/api/notifications/read-all', { method: 'POST', headers });
        cache = [];
        renderAll();
      } catch (err) { console.error(err); }
    });

    listEl.addEventListener('click', async (e) => {
      const item = e.target.closest('.notif-item');
      if (!item) return;
      const id = item.dataset.id;
      const link = item.dataset.link;
      try {
        if (id) await fetch(`/api/notifications/${id}/read`, { method: 'POST', headers });
      } catch (err) { /* ignore — still navigate */ }
      if (link) {
        window.location.href = link;
      } else {
        cache = cache.filter((n) => String(n.id) !== String(id));
        renderAll();
      }
    });

    return { btn, panel, listEl, clearBtn };
  }

  function renderInto({ btn, listEl, clearBtn }) {
    if (cache.length === 0) {
      btn.classList.remove('has-unread');
      clearBtn.disabled = true;
      listEl.innerHTML = `<div class="notif-empty">No alerts. Stock levels look healthy.</div>`;
      return;
    }
    btn.classList.add('has-unread');
    clearBtn.disabled = false;
    listEl.innerHTML = cache.map((n) => `
      <div class="notif-item severity-${escapeHtml(n.severity || 'warning')}"
           data-id="${escapeHtml(n.id)}"
           data-link="${escapeHtml(n.link || '')}">
        <span class="severity-dot"></span>
        <div class="body">
          <div class="item-title">${escapeHtml(n.title)}</div>
          <div class="item-body">${escapeHtml(n.body)}</div>
          <div class="item-meta">${escapeHtml(TYPE_LABEL[n.type] || n.type)} · ${timeAgo(n.created_at)}</div>
        </div>
      </div>
    `).join('');
  }

  function renderAll() {
    bells.forEach(renderInto);
  }

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications', { headers });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        cache = json.data || [];
        renderAll();
      }
    } catch (err) {
      // silent — keep last good cache
    }
  }

  // Close panels on outside click / escape
  document.addEventListener('click', () => {
    bells.forEach((b) => b.panel.classList.remove('open'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') bells.forEach((b) => b.panel.classList.remove('open'));
  });

  // Init: find every bell on the page and wire it up.
  document.querySelectorAll('button.icon-btn[title="Notifications"]').forEach((btn) => {
    bells.push(buildPanel(btn));
  });
  if (bells.length === 0) return;

  fetchNotifications();
  setInterval(fetchNotifications, POLL_MS);
})();
