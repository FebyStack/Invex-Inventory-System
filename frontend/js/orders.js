const tableBody = document.getElementById('orders-table-body');
const loadingState = document.getElementById('loading-state');
const modal = document.getElementById('order-modal');
const form = document.getElementById('order-form');
const itemsList = document.getElementById('items-list');

const typeSelect = document.getElementById('order_type');
const sourceGroup = document.getElementById('source-loc-group');
const destGroup = document.getElementById('dest-loc-group');

let productsCache = [];
let locationsCache = [];

async function loadOrders() {
  const token = sessionStorage.getItem('token');
  try {
    const res = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    loadingState.style.display = 'none';
    if (data.success) {
      tableBody.innerHTML = '';
      data.data.forEach(o => {
        const row = document.createElement('tr');
        const typeClass = o.order_type === 'IN' ? 'type-in' : (o.order_type === 'OUT' ? 'type-out' : 'type-transfer');
        const locInfo = o.order_type === 'IN' ? `&rarr; ${o.destination_location_name}` :
                       (o.order_type === 'OUT' ? `${o.source_location_name} &rarr;` :
                       `${o.source_location_name} &rarr; ${o.destination_location_name}`);

        row.innerHTML = `
          <td class="num">ORD-${o.id}</td>
          <td><span class="order-type-badge ${typeClass}">${o.order_type}</span></td>
          <td style="color: var(--fg-3);">${o.reference_no || '—'}</td>
          <td style="color: var(--fg-2);">${locInfo}</td>
          <td style="color: var(--fg-3);">${new Date(o.order_date).toLocaleDateString()}</td>
          <td style="text-align: right;" class="num">${o.item_count}</td>
          <td><span class="status-badge status-in-stock">Completed</span></td>
        `;
        tableBody.appendChild(row);
      });
    }
  } catch (err) { loadingState.textContent = 'Failed to load orders.'; }
}

async function loadCache() {
  const token = sessionStorage.getItem('token');
  const headers = { 'Authorization': `Bearer ${token}` };
  const [pRes, lRes] = await Promise.all([
    fetch('/api/products', { headers }),
    fetch('/api/locations', { headers })
  ]);
  productsCache = (await pRes.json()).data || [];
  locationsCache = (await lRes.json()).data || [];

  const sourceSelect = document.getElementById('source_location_id');
  const destSelect = document.getElementById('destination_location_id');
  locationsCache.forEach(l => {
    sourceSelect.add(new Option(l.name, l.id));
    destSelect.add(new Option(l.name, l.id));
  });
}

typeSelect.onchange = () => {
  const val = typeSelect.value;
  sourceGroup.style.display = (val === 'OUT' || val === 'TRANSFER') ? 'block' : 'none';
  destGroup.style.display = (val === 'IN' || val === 'TRANSFER') ? 'block' : 'none';
};

function addItemRow() {
  const div = document.createElement('div');
  div.className = 'item-row';
  div.innerHTML = `
    <div class="form-group">
      <label>Product</label>
      <select class="form-control product-select" required>
        <option value="">Select...</option>
        ${productsCache.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Qty</label>
      <input type="number" class="form-control qty-input" required min="1">
    </div>
    <div class="form-group">
      <label>Price (₱)</label>
      <input type="number" class="form-control price-input" required step="0.01" min="0">
    </div>
    <div class="form-group">
      <button type="button" class="remove-btn">✕</button>
    </div>
  `;
  div.querySelector('.remove-btn').onclick = () => div.remove();
  itemsList.appendChild(div);
}

document.getElementById('new-order-btn').onclick = () => {
  form.reset();
  itemsList.innerHTML = '';
  addItemRow();
  typeSelect.onchange();
  modal.style.display = 'flex';
};
document.getElementById('add-item-btn').onclick = addItemRow;
document.getElementById('cancel-btn').onclick = () => modal.style.display = 'none';

form.onsubmit = async (e) => {
  e.preventDefault();
  const token = sessionStorage.getItem('token');
  const items = Array.from(document.querySelectorAll('.item-row')).map(row => ({
    product_id: parseInt(row.querySelector('.product-select').value),
    quantity: parseInt(row.querySelector('.qty-input').value),
    unit_price: parseFloat(row.querySelector('.price-input').value)
  }));

  const payload = {
    order_type: typeSelect.value,
    reference_no: document.getElementById('reference_no').value,
    source_location_id: parseInt(document.getElementById('source_location_id').value) || null,
    destination_location_id: parseInt(document.getElementById('destination_location_id').value) || null,
    notes: document.getElementById('notes').value,
    items
  };

  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  if ((await res.json()).success) {
    modal.style.display = 'none';
    loadOrders();
  } else {
    alert('Failed to create order. Check stock levels or inputs.');
  }
};

loadCache().then(loadOrders);
