/**
 * dashboard.js
 * Single coherent loader: every tile, chart and list is driven by
 * /api/reports/dashboard plus /api/reports/low-stock. Range toggle
 * (7d / 30d / 90d) refetches the daily stock-movement series.
 */
(function () {
  'use strict';

  const token = sessionStorage.getItem('token');
  if (!token) { window.location.href = '/login.html'; return; }
  const headers = { 'Authorization': `Bearer ${token}` };

  // ── DOM refs ──
  const elTotal      = document.getElementById('stat-total');
  const elTotalDelta = document.getElementById('stat-total-delta');
  const elLow        = document.getElementById('stat-low');
  const elLowDelta   = document.getElementById('stat-low-delta');
  const elOrders     = document.getElementById('stat-orders');
  const elOrdersHint = document.querySelector('.dash-stats .stat:nth-child(3) .stat-hint');
  const elOrdersDeltaWrap = document.querySelector('.dash-stats .stat:nth-child(3) .stat-delta');
  const elOrdersLabel = document.querySelector('.dash-stats .stat:nth-child(3) .stat-label');
  const elLocations  = document.getElementById('stat-locations');
  const elLocDelta   = document.querySelector('.dash-stats .stat:nth-child(4) .stat-delta');
  const elLocHint    = document.querySelector('.dash-stats .stat:nth-child(4) .stat-hint');

  const elAlertsContainer = document.getElementById('alerts-container');
  const elAlertsSub       = document.getElementById('alerts-sub');
  const elMovementsList   = document.getElementById('movements-list');

  const rangeBtns = document.querySelectorAll('.range-toggle button');

  // ── Utilities ──
  const fmtNum = (n) => Number(n || 0).toLocaleString();
  const escapeHtml = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function timeAgo(date) {
    const s = Math.floor((Date.now() - date.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function setDelta(el, value, opts = {}) {
    if (!el) return;
    el.classList.remove('up', 'down', 'neutral');
    if (value === null || value === undefined || Number.isNaN(value)) {
      el.textContent = '—';
      el.classList.add('neutral');
      return;
    }
    const v = Number(value);
    if (v === 0) { el.textContent = '0'; el.classList.add('neutral'); return; }
    const sign = v > 0 ? '+' : '';
    el.textContent = `${sign}${v}${opts.percent ? '%' : ''}`;
    // For "low stock" up = bad. opts.invert flips colors.
    const good = opts.invert ? v < 0 : v > 0;
    el.classList.add(good ? 'up' : 'down');
  }

  // ── Sparklines (overrides hardcoded points once data arrives) ──
  function renderSparkline(el, points, color) {
    if (!el || !points || points.length === 0) return;
    const w = 100, h = 22;
    const max = Math.max(...points), min = Math.min(...points);
    const range = (max - min) || 1;
    const pts = points
      .map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / range) * h}`)
      .join(' ');
    el.setAttribute('viewBox', `0 0 ${w} ${h}`);
    el.setAttribute('preserveAspectRatio', 'none');
    el.innerHTML =
      `<polyline points="${pts}" fill="none" stroke="${color}" ` +
      `stroke-width="1" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  }

  function renderInitialSparklines() {
    const colorMap = {
      accent: 'var(--accent)',
      warning: 'var(--warning)',
      danger: 'var(--danger)',
      muted: 'var(--fg-4)',
    };
    document.querySelectorAll('.sparkline').forEach((svg) => {
      const points = (svg.dataset.points || '').split(',').filter(Boolean).map(Number);
      const color = colorMap[svg.dataset.color] || 'var(--accent)';
      if (points.length) renderSparkline(svg, points, color);
    });
  }
  renderInitialSparklines();

  // ── Area chart for stock movement ──
  function renderAreaChart(series) {
    const svg = document.getElementById('area-chart');
    if (!svg) return;
    const w = 800, h = 200, days = series.length;
    if (days === 0) { svg.innerHTML = ''; return; }
    const inData  = series.map((p) => p.in);
    const outData = series.map((p) => p.out);
    const all = [...inData, ...outData];
    const max = Math.max(...all, 1);
    const min = 0;
    const range = (max - min) || 1;
    const pad = { t: 12, r: 8, b: 24, l: 32 };
    const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
    const xy = (arr) => arr.map((v, i) => [
      pad.l + (days === 1 ? cw / 2 : (i / (arr.length - 1)) * cw),
      pad.t + ch - ((v - min) / range) * ch,
    ]);
    const inPts = xy(inData), outPts = xy(outData);
    const toPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
    const toArea = (pts) =>
      `${toPath(pts)} L${pts[pts.length - 1][0]},${pad.t + ch} L${pts[0][0]},${pad.t + ch} Z`;

    const ticks = [max, Math.round(max * 0.66), Math.round(max * 0.33), 0];
    let html = `<defs>
      <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>`;
    ticks.forEach((v, i) => {
      const y = pad.t + (i / (ticks.length - 1)) * ch;
      html += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="var(--border)" stroke-width="1" ${
        i === ticks.length - 1 ? '' : 'stroke-dasharray="2,3"'
      }/>`;
      html += `<text x="${pad.l - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--fg-4)" font-family="DM Mono, monospace">${v}</text>`;
    });
    // Day labels — pick ~5 evenly spaced ticks
    const labelCount = Math.min(5, days);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round((i / Math.max(labelCount - 1, 1)) * (days - 1));
      const x = pad.l + (days === 1 ? cw / 2 : (idx / (days - 1)) * cw);
      html += `<text x="${x}" y="${h - 8}" text-anchor="middle" font-size="9" fill="var(--fg-4)" font-family="DM Mono, monospace">d${idx + 1}</text>`;
    }
    html += `<path d="${toArea(inPts)}" fill="url(#inGrad)"/>`;
    html += `<path d="${toPath(inPts)}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>`;
    html += `<path d="${toPath(outPts)}" fill="none" stroke="var(--fg-4)" stroke-width="1.2" stroke-dasharray="3,3"/>`;
    svg.innerHTML = html;
  }

  // ── Pie chart for stock by category ──
  function renderPieChart(categories) {
    const svg = document.getElementById('pie-chart');
    const legend = document.getElementById('pie-legend');
    if (!svg || !legend) return;

    const data = (categories || [])
      .map((c) => ({ name: c.category_name, value: Number(c.total_quantity || 0) }))
      .filter((c) => c.value > 0);

    if (data.length === 0) {
      svg.innerHTML = `<text x="140" y="140" text-anchor="middle" fill="var(--fg-4)" font-size="12">No stock data</text>`;
      legend.innerHTML = '';
      return;
    }

    const palette = ['#F87171', '#FBBF24', '#4ADE80', '#60A5FA', '#A78BFA', '#F472B6', '#34D399', '#FB923C'];
    const total = data.reduce((s, d) => s + d.value, 0);
    const cx = 140, cy = 140, r = 100, innerR = 64;

    let angle = -Math.PI / 2;
    let svgHtml = '';
    data.forEach((d, i) => {
      const slice = (d.value / total) * Math.PI * 2;
      const a0 = angle, a1 = angle + slice;
      angle = a1;
      const large = slice > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0),       y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1),       y1 = cy + r * Math.sin(a1);
      const ix0 = cx + innerR * Math.cos(a0), iy0 = cy + innerR * Math.sin(a0);
      const ix1 = cx + innerR * Math.cos(a1), iy1 = cy + innerR * Math.sin(a1);
      const path = [
        `M${x0},${y0}`,
        `A${r},${r} 0 ${large} 1 ${x1},${y1}`,
        `L${ix1},${iy1}`,
        `A${innerR},${innerR} 0 ${large} 0 ${ix0},${iy0}`,
        'Z',
      ].join(' ');
      svgHtml += `<path d="${path}" fill="${palette[i % palette.length]}" opacity="0.92"></path>`;
    });
    svgHtml += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="var(--fg-1)" font-size="22" font-weight="500" font-family="DM Sans, sans-serif">${fmtNum(total)}</text>`;
    svgHtml += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="var(--fg-4)" font-size="11" font-family="DM Mono, monospace" letter-spacing="0.5">UNITS</text>`;
    svg.innerHTML = svgHtml;

    legend.innerHTML = data.map((d, i) => {
      const pct = ((d.value / total) * 100).toFixed(1);
      return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <span style="width:10px;height:10px;border-radius:2px;background:${palette[i % palette.length]};flex-shrink:0;"></span>
          <span style="flex:1;color:var(--fg-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.name)}</span>
          <span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--fg-3);">${fmtNum(d.value)}</span>
          <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--fg-4);min-width:42px;text-align:right;">${pct}%</span>
        </div>`;
    }).join('');
  }

  // ── Activity feed ──
  function renderActivity(rows) {
    if (!elMovementsList) return;
    if (!rows || rows.length === 0) {
      elMovementsList.innerHTML =
        `<div style="padding:14px 0;color:var(--fg-4);font-size:12px;">No recent activity</div>`;
      return;
    }
    elMovementsList.innerHTML = rows.map((m) => {
      const qty = Number(m.quantity_change || 0);
      const isIn = qty > 0;
      const dotClass = isIn ? 'in' : 'out';
      const delta = `${isIn ? '+' : ''}${qty}`;
      const ago = timeAgo(new Date(m.movement_date));
      const title =
        m.source_type === 'TRANSFER_IN'  ? 'Transfer received' :
        m.source_type === 'TRANSFER_OUT' ? 'Transfer sent'     :
        m.source_type === 'ADJUSTMENT'   ? (isIn ? 'Adjustment +' : 'Adjustment −') :
        m.source_type === 'ORDER'        ? (isIn ? 'Order received' : 'Order shipped') :
        (isIn ? 'Stock added' : 'Stock removed');
      return `
        <div class="activity-item">
          <div class="activity-dot ${dotClass}"></div>
          <div style="flex:1;min-width:0;">
            <div class="activity-title">${escapeHtml(title)}</div>
            <div class="activity-item-name">${escapeHtml(m.product_name || '—')}</div>
            <div class="activity-meta">${escapeHtml(delta)} · ${ago}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Needs attention ──
  async function loadNeedsAttention() {
    try {
      const res = await fetch('/api/reports/low-stock', { headers });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'low-stock failed');
      const items = json.data || [];
      if (items.length === 0) {
        elAlertsContainer.innerHTML =
          `<div style="padding:32px;text-align:center;color:var(--fg-4);font-size:13px;">All stock levels healthy</div>`;
        elAlertsSub.textContent = 'No items below minimum';
        return;
      }
      elAlertsSub.textContent = `${items.length} item${items.length === 1 ? '' : 's'} below minimum stock level`;
      elAlertsContainer.innerHTML = items.slice(0, 6).map((p) => {
        const stock = Number(p.current_stock || 0);
        const isOut = stock === 0;
        return `
          <div class="needs-row">
            <div class="needs-name">${escapeHtml(p.product_name)}</div>
            <div class="needs-sku">${escapeHtml(p.sku)}</div>
            <div class="needs-qty" style="color:${isOut ? 'var(--danger)' : 'var(--warning)'}">
              ${stock} <span class="max">/ ${p.reorder_level}</span>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <span class="status-badge ${isOut ? 'status-out-of-stock' : 'status-low-stock'}">${isOut ? 'OUT' : 'LOW'}</span>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      console.error('Needs attention error:', err);
      elAlertsContainer.innerHTML =
        `<div style="padding:24px;text-align:center;color:var(--fg-4);font-size:13px;">Could not load alerts.</div>`;
    }
  }

  // ── Master loader ──
  let currentRange = 30;

  async function loadDashboard(days = currentRange) {
    currentRange = days;
    try {
      const res = await fetch(`/api/reports/dashboard?days=${days}`, { headers });
      if (res.status === 401 || res.status === 403) {
        window.location.href = '/login.html';
        return;
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'dashboard fetch failed');

      const { summary, recentActivity, charts } = json.data;
      const series = charts.stockMovementSeries || [];

      // Stat values
      elTotal.textContent     = fmtNum(summary.totalProducts);
      elLow.textContent       = fmtNum(summary.lowStock);
      elOrders.textContent    = fmtNum(summary.ordersThisWeek);
      elLocations.textContent = fmtNum(summary.activeLocations);

      // Deltas
      setDelta(elTotalDelta, summary.productsAdded7d > 0 ? summary.productsAdded7d : null);
      // Low stock — we don't have a historical baseline, so show count only
      if (elLowDelta) {
        elLowDelta.textContent = summary.lowStock > 0 ? `${summary.lowStock}` : '0';
        elLowDelta.classList.remove('up', 'down', 'neutral');
        elLowDelta.classList.add(summary.lowStock > 0 ? 'down' : 'neutral');
      }

      // Pending → "Orders this week" with WoW delta
      if (elOrdersLabel) elOrdersLabel.textContent = 'Orders this week';
      if (elOrdersHint)  elOrdersHint.textContent  = 'last 7 days';
      const wowDelta = summary.ordersThisWeek - summary.ordersLastWeek;
      setDelta(elOrdersDeltaWrap, summary.ordersLastWeek > 0 || summary.ordersThisWeek > 0 ? wowDelta : null);

      // Locations delta — locations rarely change; show neutral
      if (elLocDelta) {
        elLocDelta.textContent = '—';
        elLocDelta.classList.remove('up', 'down');
        elLocDelta.classList.add('neutral');
      }
      if (elLocHint) {
        elLocHint.textContent = summary.activeLocations === 1 ? 'site tracked' : 'sites tracked';
      }

      // Sparklines from real series — last 16 points so the line has shape
      const tail = (arr, n) => arr.slice(Math.max(arr.length - n, 0));
      const inSeries  = tail(series.map((p) => p.in), 16);
      const outSeries = tail(series.map((p) => p.out), 16);
      const totalSeries = inSeries.length === outSeries.length
        ? inSeries.map((v, i) => v - outSeries[i])
        : inSeries;

      const sparkTotal = document.querySelector('.dash-stats .stat:nth-child(1) .sparkline');
      const sparkLow   = document.querySelector('.dash-stats .stat:nth-child(2) .sparkline');
      const sparkOrd   = document.querySelector('.dash-stats .stat:nth-child(3) .sparkline');
      const sparkLoc   = document.querySelector('.dash-stats .stat:nth-child(4) .sparkline');

      if (totalSeries.length) renderSparkline(sparkTotal, totalSeries, 'var(--accent)');
      if (outSeries.length)   renderSparkline(sparkLow,   outSeries,   'var(--warning)');
      if (inSeries.length)    renderSparkline(sparkOrd,   inSeries,    'var(--accent)');
      // Locations is flat — show a flat baseline
      const flat = Array(8).fill(summary.activeLocations || 0);
      renderSparkline(sparkLoc, flat, 'var(--fg-4)');

      // Charts + lists
      renderAreaChart(series);
      renderPieChart(charts.stockByCategory || []);
      renderActivity(recentActivity || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  }

  // Range toggle wiring
  rangeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const label = btn.textContent.trim();
      const days = label === '7d' ? 7 : label === '90d' ? 90 : 30;
      rangeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      loadDashboard(days);
    });
  });

  loadDashboard();
  loadNeedsAttention();
})();
