/**
 * activity-log.js — Admin-only audit trail viewer.
 *
 * Backend: GET /api/activity-logs (admin-only). Supports filters: user_id,
 * action, entity_type, location_id, start_date, end_date, search, limit,
 * offset. Facets endpoint hands back the distinct actions/entities so the
 * dropdowns reflect what's actually in the log.
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  // Format the stored details field. The backend stores either a plain string
  // or a JSON-stringified object. For objects, render the keys inline so the
  // most useful fields are visible without expanding.
  function formatDetails(raw) {
    if (raw === null || raw === undefined || raw === '') return '—';
    let parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { return raw; }
    }
    if (typeof parsed !== 'object') return String(parsed);
    return Object.entries(parsed)
      .map(([k, v]) => `<span class="kv"><span class="k">${escapeHtml(k)}</span>=<span class="v">${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</span></span>`)
      .join(' ');
  }

  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return `${dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })} · ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  function initials(s) {
    return String(s || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }

  // Some actions are common enough to call out visually. The class controls
  // the small chip color in the Action column.
  function actionTone(action) {
    if (!action) return 'tone-neutral';
    if (action.startsWith('LOGIN') || action.startsWith('CREATE') || action.startsWith('REGISTER')) return 'tone-positive';
    if (action.startsWith('DELETE') || action.startsWith('LOGOUT')) return 'tone-negative';
    if (action.startsWith('UPDATE') || action.includes('STOCK') || action.includes('CHANGE')) return 'tone-warning';
    return 'tone-neutral';
  }

  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  const PAGE_SIZE = 50;

  const els = {
    body: document.getElementById('log-body'),
    empty: document.getElementById('empty-state'),
    loading: document.getElementById('loading-state'),
    count: document.getElementById('result-count'),
    pageInfo: document.getElementById('page-info'),
    prev: document.getElementById('prev-btn'),
    next: document.getElementById('next-btn'),
    search: document.getElementById('filter-search'),
    user: document.getElementById('filter-user'),
    action: document.getElementById('filter-action'),
    entity: document.getElementById('filter-entity'),
    start: document.getElementById('filter-start'),
    end: document.getElementById('filter-end'),
    refresh: document.getElementById('refresh-btn'),
  };

  let page = 0;
  let lastRowCount = 0;

  function currentFilters() {
    return {
      search: els.search.value.trim(),
      user_id: els.user.value,
      action: els.action.value,
      entity_type: els.entity.value,
      start_date: els.start.value,
      end_date: els.end.value,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
  }

  function buildQuery(params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    return qs.toString();
  }

  async function loadFacets() {
    try {
      const [uRes, fRes] = await Promise.all([
        fetch('/api/users', { headers }),
        fetch('/api/activity-logs/facets', { headers }),
      ]);
      const uData = await uRes.json();
      const fData = await fRes.json();
      if (uData.success) {
        (uData.data || []).forEach((u) => {
          els.user.add(new Option(`${u.full_name || u.username} (@${u.username})`, u.id));
        });
      }
      if (fData.success) {
        (fData.data.actions || []).forEach((a) => els.action.add(new Option(a, a)));
        (fData.data.entity_types || []).forEach((e) => els.entity.add(new Option(e, e)));
      }
    } catch (err) {
      console.error('Facet load error:', err);
    }
  }

  async function load() {
    els.body.innerHTML = '<tr><td colspan="6" class="list-loading">Loading activity…</td></tr>';
    try {
      const qs = buildQuery(currentFilters());
      const res = await fetch(`/api/activity-logs?${qs}`, { headers });
      const data = await res.json();

      if (!data.success) {
        els.body.innerHTML = `<tr><td colspan="6" class="list-loading">${escapeHtml(data.message || 'Failed to load')}</td></tr>`;
        return;
      }

      const rows = data.data || [];
      lastRowCount = rows.length;

      if (rows.length === 0) {
        els.body.innerHTML = '';
        els.empty.style.display = page === 0 ? 'block' : 'none';
        els.count.textContent = page === 0 ? 'No matching activity.' : 'No more entries on this page.';
      } else {
        els.empty.style.display = 'none';
        els.body.innerHTML = rows.map(rowHtml).join('');
        els.count.textContent = `Showing ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} (page ${page + 1}).`;
      }

      els.pageInfo.textContent = `Page ${page + 1}`;
      els.prev.disabled = page === 0;
      els.next.disabled = rows.length < PAGE_SIZE;
    } catch (err) {
      console.error('Load error:', err);
      els.body.innerHTML = '<tr><td colspan="6" class="list-loading">Network error.</td></tr>';
    }
  }

  function rowHtml(r) {
    const userLabel = r.full_name || r.username || `User #${r.user_id}`;
    const entity = r.entity_type
      ? `${escapeHtml(r.entity_type)}${r.entity_id ? ` #${escapeHtml(r.entity_id)}` : ''}`
      : '—';
    const loc = r.location_name
      ? `<span class="mono" style="font-size:11px;color:var(--fg-3);">${escapeHtml(r.location_code || '—')}</span> <span style="color:var(--fg-2);font-size:12px;">${escapeHtml(r.location_name)}</span>`
      : '<span style="color:var(--fg-4);">—</span>';

    return `
      <tr>
        <td class="mono" style="color:var(--fg-3);font-size:11px;">${escapeHtml(fmtDate(r.created_at))}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="avatar-circle sm">${escapeHtml(initials(userLabel))}</div>
            <div>
              <div style="font-size:13px;color:var(--fg-1);">${escapeHtml(userLabel)}</div>
              <div style="font-size:11px;color:var(--fg-4);">${escapeHtml(r.role || '')}</div>
            </div>
          </div>
        </td>
        <td><span class="status-badge ${actionTone(r.action)}">${escapeHtml(r.action || '—')}</span></td>
        <td style="color:var(--fg-2);font-size:12px;">${entity}</td>
        <td style="color:var(--fg-2);font-size:12px;max-width:480px;overflow:hidden;text-overflow:ellipsis;">${formatDetails(r.details)}</td>
        <td>${loc}</td>
      </tr>`;
  }

  // ── Event wiring ────────────────────────────────
  let searchTimer = null;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 0; load(); }, 250);
  });
  ['change'].forEach((evt) => {
    [els.user, els.action, els.entity, els.start, els.end].forEach((el) => {
      el.addEventListener(evt, () => { page = 0; load(); });
    });
  });
  els.refresh.addEventListener('click', () => load());
  els.prev.addEventListener('click', () => { if (page > 0) { page--; load(); } });
  els.next.addEventListener('click', () => { if (lastRowCount === PAGE_SIZE) { page++; load(); } });

  // ── Boot ────────────────────────────────────────
  loadFacets().then(load);
})();
