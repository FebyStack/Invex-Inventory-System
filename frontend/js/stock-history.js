/**
 * stock-history.js
 * Shows the full stock movement timeline for a single product.
 * Accessed via: /stock-history.html?product_id=123
 */
(function () {
  'use strict';

  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  const params = new URLSearchParams(window.location.search);
  const productId = params.get('product_id');

  const timeline = document.getElementById('timeline');
  const loadingState = document.getElementById('loading-state');
  const noDataState = document.getElementById('no-data-state');
  const filterType = document.getElementById('filter-type');

  let allMovements = [];

  if (!productId) {
    loadingState.textContent = 'No product specified. Go back and click "View History" on a product.';
    return;
  }

  // Load product info
  async function loadProductInfo() {
    try {
      const res = await fetch(`/api/products/${productId}`, { headers });
      const data = await res.json();
      if (data.success && data.data) {
        document.getElementById('product-name').textContent = data.data.name;
        document.getElementById('product-sku').textContent = data.data.sku;
      }
    } catch (err) {
      console.error('Error loading product info:', err);
    }
  }

  // Load history
  async function loadHistory() {
    try {
      const res = await fetch(`/api/products/${productId}/history`, { headers });
      const data = await res.json();

      loadingState.style.display = 'none';

      if (data.success && data.data && data.data.length > 0) {
        allMovements = data.data;
        renderTimeline(allMovements);
      } else {
        noDataState.style.display = 'block';
      }
    } catch (err) {
      console.error('Error loading history:', err);
      loadingState.textContent = 'Failed to load history.';
    }
  }

  function renderTimeline(movements) {
    timeline.innerHTML = '';
    timeline.style.display = 'block';
    noDataState.style.display = 'none';

    if (movements.length === 0) {
      timeline.style.display = 'none';
      noDataState.style.display = 'block';
      return;
    }

    movements.forEach(m => {
      const isPositive = m.quantity_change > 0;
      const sourceType = (m.source_type || '').toUpperCase();

      let dotClass = 'dot-adjustment';
      if (sourceType === 'ORDER' || sourceType === 'STOCK_IN') dotClass = 'dot-in';
      else if (sourceType === 'STOCK_OUT') dotClass = 'dot-out';

      const date = new Date(m.movement_date);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.innerHTML = `
        <div class="timeline-dot ${dotClass}"></div>
        <div class="timeline-row">
          <div class="timeline-main">
            <div class="timeline-type">${formatSourceType(sourceType)}</div>
            <div class="timeline-meta">
              <span>${dateStr} at ${timeStr}</span>
              <span>${m.location_name || '-'}</span>
              ${m.performed_by ? `<span>by ${m.performed_by}</span>` : ''}
            </div>
            ${m.notes ? `<div class="timeline-notes">${m.notes}</div>` : ''}
          </div>
          <div class="timeline-qty ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}${m.quantity_change}
          </div>
        </div>
      `;
      timeline.appendChild(item);
    });
  }

  function formatSourceType(type) {
    const map = {
      'ORDER': 'Stock Order',
      'STOCK_IN': 'Stock In',
      'STOCK_OUT': 'Stock Out',
      'ADJUSTMENT': 'Adjustment',
      'TRANSFER': 'Transfer',
      'TRANSFER_IN': 'Transfer In',
      'TRANSFER_OUT': 'Transfer Out',
    };
    return map[type] || type;
  }

  // Filter handler
  filterType.addEventListener('change', () => {
    const val = filterType.value;
    if (!val) {
      renderTimeline(allMovements);
    } else {
      const filtered = allMovements.filter(m => {
        const src = (m.source_type || '').toUpperCase();
        if (val === 'ORDER') return src.includes('ORDER') || src.includes('STOCK');
        if (val === 'ADJUSTMENT') return src === 'ADJUSTMENT';
        if (val === 'TRANSFER') return src.includes('TRANSFER');
        return true;
      });
      renderTimeline(filtered);
    }
  });

  loadProductInfo();
  loadHistory();
})();
