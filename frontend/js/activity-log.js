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

  /**
   * Translates raw activity details into a human-readable sentence.
   */
  function formatDetails(raw, action) {
    if (raw === null || raw === undefined || raw === '') return '—';
    let parsed = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { return escapeHtml(raw); }
    }
    if (typeof parsed !== 'object') return escapeHtml(String(parsed));

    // Mapping of common actions to sentence templates
    switch (action) {
      case 'LOGIN':
        return `Successfully logged into the system.`;
      case 'LOGOUT':
        return `Logged out of the session.`;
      case 'CREATE_IN_ORDER':
        return `Created stock-in order <strong>${escapeHtml(parsed.reference_no || '—')}</strong> with ${parsed.itemCount || 0} item(s).`;
      case 'CREATE_OUT_ORDER':
        return `Created stock-out order <strong>${escapeHtml(parsed.reference_no || '—')}</strong> with ${parsed.itemCount || 0} item(s).`;
      case 'CREATE_TRANSFER_ORDER':
        return `Created internal transfer <strong>${escapeHtml(parsed.reference_no || '—')}</strong> moving ${parsed.itemCount || 0} item(s).`;
      case 'UPDATE_ORDER':
        return `Updated order details for <strong>${escapeHtml(parsed.reference_no || '—')}</strong>.`;
      case 'DELETE_ORDER':
        return `Deleted order and reversed stock movements.`;
      case 'CREATE_PRODUCT':
        return `Registered new product: <strong>${escapeHtml(parsed.name || '—')}</strong> (${escapeHtml(parsed.sku || '—')}).`;
      case 'UPDATE_PRODUCT':
        return `Modified product details for <strong>${escapeHtml(parsed.name || '—')}</strong>.`;
      case 'DELETE_PRODUCT':
        return `Removed product from catalog.`;
      case 'CREATE_CATEGORY':
        return `Created new category: <strong>${escapeHtml(parsed.name || '—')}</strong>.`;
      case 'UPDATE_CATEGORY':
        return `Updated category details for <strong>${escapeHtml(parsed.name || '—')}</strong>.`;
      case 'DELETE_CATEGORY':
        return `Removed category from the system.`;
      case 'CREATE_SUPPLIER':
        return `Added new supplier: <strong>${escapeHtml(parsed.name || '—')}</strong>.`;
      case 'UPDATE_SUPPLIER':
        return `Updated supplier info for <strong>${escapeHtml(parsed.name || '—')}</strong>.`;
      case 'DELETE_SUPPLIER':
        return `Removed supplier record.`;
      case 'CREATE_LOCATION':
        return `Created new location: <strong>${escapeHtml(parsed.name || '—')}</strong> (${escapeHtml(parsed.code || '—')}).`;
      case 'UPDATE_LOCATION':
        return `Modified location details for <strong>${escapeHtml(parsed.name || '—')}</strong>.`;
      case 'DELETE_LOCATION':
        return `Removed location from the system.`;
      case 'STOCK_INCREASE':
      case 'STOCK_DECREASE':
      case 'STOCK_ADJUSTMENT':
        const prod = parsed.product_name || `product #${parsed.product_id}`;
        const direction = parsed.adjustment_type === 'INCREASE' || action === 'STOCK_INCREASE' ? 'Added' : 'Removed';
        return `${direction} ${parsed.quantity_change || parsed.quantity} unit(s) of <strong>${escapeHtml(prod)}</strong> due to ${escapeHtml(parsed.reason || 'manual adjustment')}.`;
      case 'STOCK_TRANSFER':
        const transferProd = parsed.product_name || `product #${parsed.product_id}`;
        return `Transferred ${parsed.quantity_change} unit(s) of <strong>${escapeHtml(transferProd)}</strong> between locations.`;
      case 'IMPORT_PRODUCTS':
      case 'CREATE_BATCH':
        return `Created new batch <strong>${escapeHtml(parsed.batch_no || '—')}</strong> for <strong>${escapeHtml(parsed.product_name || 'product')}</strong>.`;
      case 'UPDATE_BATCH':
        return `Updated batch details for <strong>${escapeHtml(parsed.batch_no || '—')}</strong>.`;
      case 'DELETE_BATCH':
        return `Removed product batch from the system.`;
      case 'CREATE_USER':
        return `Created new user account: <strong>${escapeHtml(parsed.username || '—')}</strong> with role <strong>${escapeHtml(parsed.role || 'staff')}</strong>.`;
      case 'UPDATE_USER':
        return `Updated account details for <strong>${escapeHtml(parsed.username || '—')}</strong>.`;
      case 'DELETE_USER':
        return `Deactivated user account.`;
      case 'CHANGE_PASSWORD':
        return `Successfully changed account password.`;
      case 'REGISTER':
        return `New user account registered: <strong>${escapeHtml(parsed.username || '—')}</strong>.`;
      case 'SECURITY_VIOLATION':
        return `<span style="color:var(--danger)">Security alert: ${escapeHtml(parsed.message || 'Suspicious activity detected')}.</span>`;
      case 'CREATE_REASON_CODE':
        return `Added new reason code: <strong>${escapeHtml(parsed.code || '—')}</strong>.`;
      case 'DELETE_REASON_CODE':
        return `Removed reason code from the system.`;
      case 'DELETE_TRANSFER':
        return `Deleted transfer record and reversed stock movements.`;
      case 'DELETE_ADJUSTMENT':
        return `Deleted manual stock adjustment.`;
      case 'ADJUST_STOCK_BATCH':
        return `Applied a batch of stock adjustments to <strong>${escapeHtml(parsed.product_name || 'product')}</strong> across ${parsed.applied?.length || 0} location(s).`;
      case 'IMPORT_PRODUCTS':
      case 'IMPORT_STOCK':
        return `Bulk imported ${parsed.count || parsed.total_units || 0} items into the system.`;
      case 'EXPORT_PRODUCTS':
        return `Generated product export file.`;
      default:
        // Smart fallback sentence builder
        const name = parsed.name || parsed.full_name || parsed.username || parsed.reference_no || parsed.code;
        if (action.startsWith('CREATE')) return `Created new entry${name ? `: <strong>${escapeHtml(name)}</strong>` : ''}.`;
        if (action.startsWith('UPDATE')) return `Updated details for ${name ? `<strong>${escapeHtml(name)}</strong>` : 'an entry'}.`;
        if (action.startsWith('DELETE')) return `Deleted entry from the system.`;
        
        return `<span style="color:var(--fg-4); font-family: 'DM Mono', monospace; font-size: 11px;">
          ${escapeHtml(JSON.stringify(parsed)).slice(0, 80)}${JSON.stringify(parsed).length > 80 ? '...' : ''}
        </span>`;
    }
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
    let entityLabel = r.entity_type ? escapeHtml(r.entity_type) : '—';
    if (r.entity_id) {
      // Try to find a more readable name in the details JSON (reference_no, name, username, etc.)
      try {
        const p = typeof r.details === 'string' ? JSON.parse(r.details) : r.details;
        if (p) {
          const name = p.reference_no || p.full_name || p.name || p.username || p.code;
          if (name) {
            entityLabel = `<strong>${escapeHtml(name)}</strong> <span style="color:var(--fg-4); font-size:10px;">(${escapeHtml(r.entity_type)})</span>`;
          } else {
            entityLabel += ` <span style="color:var(--fg-4);">#${escapeHtml(r.entity_id)}</span>`;
          }
        } else {
          entityLabel += ` <span style="color:var(--fg-4);">#${escapeHtml(r.entity_id)}</span>`;
        }
      } catch {
        entityLabel += ` <span style="color:var(--fg-4);">#${escapeHtml(r.entity_id)}</span>`;
      }
    }
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
        <td style="color:var(--fg-2);font-size:12px;">${entityLabel}</td>
        <td style="color:var(--fg-2);font-size:12px;">${formatDetails(r.details, r.action)}</td>
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
