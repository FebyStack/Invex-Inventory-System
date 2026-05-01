const tableBody = document.getElementById('adjustments-table-body');
const loadingState = document.getElementById('loading-state');
const noDataState = document.getElementById('no-data-state');
const modal = document.getElementById('adjustment-modal');
const form = document.getElementById('adjustment-form');

const productSelect = document.getElementById('product_id');
const locationSelect = document.getElementById('location_id');
const reasonSelect = document.getElementById('reason_code_id');

// Fetch initial data
async function loadData() {
  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };

  try {
    // Load Adjustments
    const res = await fetch('/api/adjustments', { headers });
    const data = await res.json();

    loadingState.style.display = 'none';

    if (data.success && data.data.length > 0) {
      tableBody.innerHTML = '';
      data.data.forEach(adj => {
        const row = document.createElement('tr');
        const date = new Date(adj.adjustment_date).toLocaleDateString() + ' ' + new Date(adj.adjustment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const isUp = adj.adjustment_type === 'INCREASE';
        row.innerHTML = `
          <td style="color: var(--fg-3);">${date}</td>
          <td>
            <div style="font-weight: 500; color: var(--fg-1);">${adj.product_name}</div>
            <div style="font-size: 11px; color: var(--fg-4); font-family: 'DM Mono', monospace;">${adj.sku}</div>
          </td>
          <td style="color: var(--fg-2);">${adj.location_name}</td>
          <td><span class="status-badge ${isUp ? 'status-in-stock' : 'status-out-of-stock'}">${isUp ? 'Increase' : 'Decrease'}</span></td>
          <td class="num ${isUp ? 'qty-up' : 'qty-down'}" style="text-align: right;">${isUp ? '+' : '−'}${adj.quantity_change}</td>
          <td>
            <div style="color: var(--fg-1);">${adj.reason_code}</div>
            <div style="font-size: 11px; color: var(--fg-4);">${adj.reason_description}</div>
          </td>
          <td style="color: var(--fg-3);">${adj.adjusted_by}</td>
        `;
        tableBody.appendChild(row);
      });
    } else {
      noDataState.style.display = 'block';
    }

    // Load Products for dropdown
    const pRes = await fetch('/api/products', { headers });
    const pData = await pRes.json();
    if (pData.success) {
      pData.data.forEach(p => {
        const opt = new Option(`${p.name} (${p.sku})`, p.id);
        productSelect.add(opt);
      });
    }

    // Load Locations for dropdown
    const lRes = await fetch('/api/locations', { headers });
    const lData = await lRes.json();
    if (lData.success) {
      lData.data.forEach(l => {
        const opt = new Option(l.name, l.id);
        locationSelect.add(opt);
      });
    }

    // Load Reason Codes for dropdown
    const rRes = await fetch('/api/reason-codes', { headers });
    const rData = await rRes.json();
    if (rData.success) {
      rData.data.forEach(r => {
        const opt = new Option(`${r.code} - ${r.description}`, r.id);
        reasonSelect.add(opt);
      });
    }

  } catch (err) {
    console.error('Error loading adjustments:', err);
    loadingState.textContent = 'Failed to load adjustments.';
  }
}

// Modal logic
document.getElementById('new-adjustment-btn').onclick = () => modal.style.display = 'flex';
document.getElementById('cancel-btn').onclick = () => modal.style.display = 'none';
window.onclick = (event) => { if (event.target == modal) modal.style.display = 'none'; }

// Submit form
form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');

  const payload = {
    product_id: parseInt(productSelect.value),
    location_id: parseInt(locationSelect.value),
    adjustment_type: document.getElementById('adjustment_type').value,
    quantity_change: parseInt(document.getElementById('quantity_change').value),
    reason_code_id: parseInt(reasonSelect.value),
    notes: document.getElementById('notes').value
  };

  try {
    const response = await fetch('/api/adjustments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.success) {
      modal.style.display = 'none';
      form.reset();
      loadData(); // Refresh list
    } else {
      alert('Error: ' + result.message);
    }
  } catch (err) {
    alert('Network error. Please try again.');
  }
};

loadData();
