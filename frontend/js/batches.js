const tableBody = document.getElementById('batches-table-body');
const loadingState = document.getElementById('loading-state');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');

function getExpiryStatus(expiryDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  const daysLeft = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));
  
  let status, badge, color;
  
  if (daysLeft < 0) {
    status = 'expired';
    badge = 'Expired';
    color = '#991B1B'; // Dark red
  } else if (daysLeft < 30) {
    status = 'urgent';
    badge = 'Urgent';
    color = '#DC2626'; // Red
  } else if (daysLeft < 90) {
    status = 'warning';
    badge = 'Caution';
    color = '#FBBF24'; // Yellow
  } else {
    status = 'ok';
    badge = 'Healthy';
    color = '#10B981'; // Green
  }
  
  return { status, badge, color, daysLeft };
}

async function loadBatches() {
  const token = sessionStorage.getItem('token');
  
  try {
    const res = await fetch('/api/batches', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    loadingState.style.display = 'none';
    if (data.success) {
      tableBody.innerHTML = '';
      
      let filteredBatches = data.data;
      
      // Apply filters
      if (searchInput.value) {
        const search = searchInput.value.toLowerCase();
        filteredBatches = filteredBatches.filter(b => 
          (b.product_name || '').toLowerCase().includes(search) ||
          (b.sku || '').toLowerCase().includes(search)
        );
      }
      
      if (filterStatus.value) {
        filteredBatches = filteredBatches.filter(b => {
          const { status } = getExpiryStatus(b.expiry_date);
          return status === filterStatus.value;
        });
      }
      
      if (filteredBatches.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--fg-4);">No batches found</td></tr>';
        return;
      }
      
      filteredBatches.forEach(batch => {
        const expiryInfo = getExpiryStatus(batch.expiry_date);
        const row = document.createElement('tr');
        const expiryDate = new Date(batch.expiry_date).toLocaleDateString();
        
        row.innerHTML = `
          <td>
            <div style="display:flex;align-items:center;">
              <span class="product-thumb">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
              </span>
              <div class="product-info">
                <span class="product-name">${batch.product_name || 'Unknown'}</span>
                <span class="product-sku">${batch.sku || '—'}</span>
              </div>
            </div>
          </td>
          <td style="font-family: 'DM Mono', monospace; color: var(--fg-2);">${batch.batch_number || '—'}</td>
          <td style="font-family: 'DM Mono', monospace; color: var(--fg-2);">${batch.quantity}</td>
          <td style="color: var(--fg-3);">${expiryDate}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${expiryInfo.color};"></div>
              <span class="status-badge" style="background-color: ${expiryInfo.color}20; color: ${expiryInfo.color}; border: 1px solid ${expiryInfo.color}40;">
                ${expiryInfo.badge}
              </span>
            </div>
          </td>
          <td style="text-align: right; font-weight: 500; color: var(--fg-2);">
            ${expiryInfo.daysLeft >= 0 ? expiryInfo.daysLeft : 'EXPIRED'}
          </td>
        `;
        tableBody.appendChild(row);
      });
    }
  } catch (err) {
    console.error('Error loading batches:', err);
    loadingState.textContent = 'Failed to load batches.';
  }
}

searchInput.addEventListener('input', loadBatches);
filterStatus.addEventListener('change', loadBatches);

loadBatches();
