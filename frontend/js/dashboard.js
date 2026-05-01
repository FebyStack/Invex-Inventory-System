document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  
  // If no token, redirect to login (assuming standard auth flow)
  // if (!token) {
  //   window.location.href = '/login.html';
  //   return;
  // }

  try {
    const response = await fetch('/api/reports/dashboard', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.error('Authentication failed');
        // window.location.href = '/login.html';
        return;
      }
      throw new Error('Failed to fetch dashboard data');
    }

    const json = await response.json();
    if (json.success && json.data) {
      const summary = json.data.summary;
      
      // Format currency
      const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP'
        }).format(value);
      };

      // Format number
      const formatNumber = (value) => {
        return new Intl.NumberFormat('en-US').format(value);
      };

      // Update Summary Cards
      document.getElementById('total-products-stat').textContent = formatNumber(summary.totalProducts);
      document.getElementById('low-stock-stat').textContent = formatNumber(summary.lowStock);
      document.getElementById('total-value-stat').textContent = formatCurrency(summary.totalValue);
      document.getElementById('out-of-stock-stat').textContent = formatNumber(summary.outOfStock);

      // Update Recent Movements Table
      const tbody = document.getElementById('recent-movements-tbody');
      tbody.innerHTML = ''; // Clear existing
      
      const recentActivity = json.data.recentActivity || [];
      
      if (recentActivity.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--text-secondary);">No recent movements found</td>`;
        tbody.appendChild(tr);
      } else {
        recentActivity.forEach(activity => {
          const tr = document.createElement('tr');
          
          const date = new Date(activity.movement_date);
          const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          
          let qtyColor = '';
          let qtySign = '';
          if (activity.quantity_change > 0) {
            qtyColor = 'var(--accent-success)';
            qtySign = '+';
          } else if (activity.quantity_change < 0) {
            qtyColor = 'var(--accent-danger)';
          }

          let statusBadge = '<span class="status-badge status-in-stock">Completed</span>';
          
          tr.innerHTML = `
            <td>${activity.product_name || 'Unknown'}</td>
            <td>${activity.source_type}</td>
            <td>${activity.performed_by || 'System'}</td>
            <td style="color: ${qtyColor}; font-weight: 500;">${qtySign}${activity.quantity_change}</td>
            <td>${dateString}</td>
            <td>${statusBadge}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  } catch (error) {
    console.error('Error loading dashboard:', error);
    // Optionally display error on screen
  }
});

// ── Sparkline rendering ──
function renderSparklines() {
  const colorMap = {
    accent: 'var(--accent)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    muted: 'var(--fg-4)',
  };
  document.querySelectorAll('.sparkline').forEach(svg => {
    const data = svg.dataset.points.split(',').map(Number);
    const w = 100, h = 22;
    const max = Math.max(...data), min = Math.min(...data);
    const range = (max - min) || 1;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = `<polyline points="${pts}" fill="none" stroke="${colorMap[svg.dataset.color] || 'var(--accent)'}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  });
}
renderSparklines();

// ── Area chart (deterministic mock; replaced if data available) ──
function renderAreaChart(inData, outData) {
  const svg = document.getElementById('area-chart');
  const w = 800, h = 200;
  const days = inData.length;
  const all = [...inData, ...outData];
  const max = Math.max(...all);
  const min = Math.min(0, ...all);
  const range = (max - min) || 1;
  const pad = { t: 12, r: 8, b: 24, l: 32 };
  const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
  const xy = arr => arr.map((v, i) => [pad.l + (i / (arr.length - 1)) * cw, pad.t + ch - ((v - min) / range) * ch]);
  const inPts = xy(inData), outPts = xy(outData);
  const toPath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const toArea = pts => `${toPath(pts)} L${pts[pts.length - 1][0]},${pad.t + ch} L${pts[0][0]},${pad.t + ch} Z`;
  const ticks = [max, max * 0.66, max * 0.33, 0].map(v => Math.round(v));

  let html = `<defs>
    <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient>
  </defs>`;
  ticks.forEach((v, i) => {
    const y = pad.t + (i / (ticks.length - 1)) * ch;
    html += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="var(--border)" stroke-width="1" ${i === ticks.length - 1 ? '' : 'stroke-dasharray="2,3"'}/>`;
    html += `<text x="${pad.l - 8}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--fg-4)" font-family="DM Mono, monospace">${v}</text>`;
  });
  [0, 7, 14, 21, 29].forEach(i => {
    if (i >= days) return;
    const x = pad.l + (i / (days - 1)) * cw;
    html += `<text x="${x}" y="${h - 8}" text-anchor="middle" font-size="9" fill="var(--fg-4)" font-family="DM Mono, monospace">d${i + 1}</text>`;
  });
  html += `<path d="${toArea(inPts)}" fill="url(#inGrad)"/>`;
  html += `<path d="${toPath(inPts)}" fill="none" stroke="var(--accent)" stroke-width="1.5"/>`;
  html += `<path d="${toPath(outPts)}" fill="none" stroke="var(--fg-4)" stroke-width="1.2" stroke-dasharray="3,3"/>`;
  svg.innerHTML = html;
}
// Initial deterministic mock — gets replaced by real data if available
(function initialChart() {
  const days = 30;
  const seed = i => 40 + Math.sin(i * 0.5) * 10 + Math.cos(i * 0.3) * 6 + i * 0.5;
  const inD = Array.from({ length: days }, (_, i) => Math.round(seed(i) + (Math.sin(i * 0.7) + 1) * 6));
  const outD = Array.from({ length: days }, (_, i) => Math.round(seed(i) * 0.55 + (Math.cos(i * 0.5) + 1) * 4));
  renderAreaChart(inD, outD);
})();

// ── Load real stats / activity ──
async function loadStats() {
  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  try {
    const [pRes, oRes, lRes] = await Promise.all([
      fetch('/api/products', { headers }),
      fetch('/api/orders', { headers }),
      fetch('/api/locations', { headers }),
    ]);
    const [pData, oData, lData] = await Promise.all([pRes.json(), oRes.json(), lRes.json()]);

    if (pData.success) document.getElementById('stat-total').textContent = pData.data.length.toLocaleString();
    if (oData.success) document.getElementById('stat-orders').textContent = oData.data.length;
    if (lData.success) document.getElementById('stat-locations').textContent = lData.data.length;

    // Low stock
    let lowStockCount = 0;
    const lowStockItems = [];
    if (pData.success) {
      for (const p of pData.data) {
        const sRes = await fetch(`/api/products/${p.id}/stock`, { headers });
        const sData = await sRes.json();
        if (sData.success) {
          const total = sData.data.reduce((sum, loc) => sum + parseInt(loc.quantity), 0);
          if (total <= p.reorder_level) {
            lowStockCount++;
            lowStockItems.push({ ...p, total });
          }
        }
      }
    }
    document.getElementById('stat-low').textContent = lowStockCount;

    // Needs attention list
    const alertsContainer = document.getElementById('alerts-container');
    const alertsSub = document.getElementById('alerts-sub');
    if (lowStockItems.length === 0) {
      alertsContainer.innerHTML = `<div style="padding:32px;text-align:center;color:var(--fg-4);font-size:13px;">All stock levels healthy</div>`;
      alertsSub.textContent = 'No items below minimum';
    } else {
      alertsSub.textContent = `${lowStockItems.length} item${lowStockItems.length === 1 ? '' : 's'} below minimum stock level`;
      alertsContainer.innerHTML = lowStockItems.slice(0, 6).map(p => {
        const isOut = p.total === 0;
        return `
          <div class="needs-row">
            <div class="needs-name">${p.name}</div>
            <div class="needs-sku">${p.sku}</div>
            <div class="needs-qty" style="color:${isOut ? 'var(--danger)' : 'var(--warning)'}">
              ${p.total} <span class="max">/ ${p.reorder_level}</span>
            </div>
            <div style="display:flex;justify-content:flex-end;">
              <span class="status-badge ${isOut ? 'status-out-of-stock' : 'status-low-stock'}">${isOut ? 'OUT' : 'LOW'}</span>
            </div>
          </div>`;
      }).join('');
    }

    // Recent activity (from adjustments)
    const movementsList = document.getElementById('movements-list');
    try {
      const adjRes = await fetch('/api/adjustments', { headers });
      const adjData = await adjRes.json();
      if (adjData.success && adjData.data.length > 0) {
        movementsList.innerHTML = adjData.data.slice(0, 6).map(m => {
          const isIn = m.adjustment_type === 'INCREASE';
          const dotClass = isIn ? 'in' : 'out';
          const delta = isIn ? `+${m.quantity_change}` : `-${m.quantity_change}`;
          const when = new Date(m.adjustment_date);
          const ago = timeAgo(when);
          return `
            <div class="activity-item">
              <div class="activity-dot ${dotClass}"></div>
              <div style="flex:1;min-width:0;">
                <div class="activity-title">${isIn ? 'Stock added' : 'Stock removed'}</div>
                <div class="activity-item-name">${m.product_name}</div>
                <div class="activity-meta">${delta} · ${ago}</div>
              </div>
            </div>`;
        }).join('');
      } else {
        movementsList.innerHTML = `<div style="padding:14px 0;color:var(--fg-4);font-size:12px;">No recent activity</div>`;
      }
    } catch {
      movementsList.innerHTML = `<div style="padding:14px 0;color:var(--fg-4);font-size:12px;">Unable to load activity</div>`;
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

loadStats();
