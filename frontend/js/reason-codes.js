const tableBody = document.getElementById('codes-table-body');
const loadingState = document.getElementById('loading-state');
const modal = document.getElementById('code-modal');
const form = document.getElementById('code-form');

async function loadCodes() {
  const token = sessionStorage.getItem('token');
  try {
    const res = await fetch('/api/reason-codes', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    loadingState.style.display = 'none';
    if (data.success) {
      tableBody.innerHTML = '';
      data.data.forEach(item => {
        const row = document.createElement('tr');
        const allows = item.adjustment_type;
        const allowsClass = allows === 'INCREASE' ? 'status-in-stock' : (allows === 'DECREASE' ? 'status-out-of-stock' : 'status-low-stock');
        const allowsLabel = allows === 'BOTH' ? 'Both' : (allows === 'INCREASE' ? 'Increase' : 'Decrease');
        row.innerHTML = `
          <td><span class="code-mono">${item.code}</span></td>
          <td style="color: var(--fg-1);">${item.description}</td>
          <td><span class="status-badge ${allowsClass}">${allowsLabel}</span></td>
          <td style="color: var(--fg-3);">${new Date(item.created_at).toLocaleDateString()}</td>
          <td style="text-align: right;">
            <button class="action-btn delete-btn" data-id="${item.id}" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            </button>
          </td>
        `;
        tableBody.appendChild(row);
      });
    }
  } catch (err) {
    loadingState.textContent = 'Failed to load codes.';
  }
}

document.getElementById('new-code-btn').onclick = () => {
  form.reset();
  modal.style.display = 'flex';
};

document.getElementById('cancel-btn').onclick = () => modal.style.display = 'none';

form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  const payload = {
    code: document.getElementById('code').value.toUpperCase(),
    description: document.getElementById('description').value,
    adjustment_type: document.getElementById('adjustment_type').value
  };

  try {
    const res = await fetch('/api/reason-codes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      modal.style.display = 'none';
      form.reset();
      loadCodes();
    } else {
      alert('Error: ' + data.message);
    }
  } catch (err) {
    alert('Network error.');
  }
};

tableBody.onclick = async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  if (btn.classList.contains('delete-btn')) {
    if (!confirm('Are you sure? This might fail if the code is in use.')) return;
    const id = btn.dataset.id;
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/api/reason-codes/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if ((await res.json()).success) loadCodes();
    else alert('Failed to delete. Code might be linked to adjustments.');
  }
};

loadCodes();
