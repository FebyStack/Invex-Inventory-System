const fs = require('fs');
const path = require('path');

const collPath = path.join(__dirname, '..', '..', 'postman', 'Invex_Collection.json');
let coll = JSON.parse(fs.readFileSync(collPath, 'utf8'));

const createFolder = (name, routes) => ({
  name: name,
  item: routes.map(r => ({
    name: r.name,
    request: {
      method: r.method,
      header: [{ key: "Authorization", value: "Bearer {{adminToken}}" }],
      url: { raw: `{{baseUrl}}${r.path}`, host: ["{{baseUrl}}"], path: r.path.split('/').filter(p => p) },
      body: r.body ? { mode: "raw", raw: JSON.stringify(r.body, null, 2), options: { raw: { language: "json" } } } : undefined
    }
  }))
});

const folders = [
  createFolder("Categories", [
    { name: "GET All Categories", method: "GET", path: "/categories" },
    { name: "POST Create Category", method: "POST", path: "/categories", body: { name: "Electronics", description: "Gadgets and devices" } },
    { name: "GET Category By ID", method: "GET", path: "/categories/1" },
    { name: "PUT Update Category", method: "PUT", path: "/categories/1", body: { name: "Updated Electronics" } },
    { name: "DELETE Category", method: "DELETE", path: "/categories/1" }
  ]),
  createFolder("Suppliers", [
    { name: "GET All Suppliers", method: "GET", path: "/suppliers" },
    { name: "POST Create Supplier", method: "POST", path: "/suppliers", body: { name: "Global Tech", contact_person: "John Doe", email: "john@tech.com" } },
    { name: "GET Supplier By ID", method: "GET", path: "/suppliers/1" },
    { name: "PUT Update Supplier", method: "PUT", path: "/suppliers/1", body: { name: "Updated Global Tech" } },
    { name: "DELETE Supplier", method: "DELETE", path: "/suppliers/1" }
  ]),
  createFolder("Reason Codes", [
    { name: "GET All Reason Codes", method: "GET", path: "/reason-codes" },
    { name: "POST Create Reason Code", method: "POST", path: "/reason-codes", body: { code: "DAMAGED", description: "Damaged on arrival", adjustment_type: "DECREASE" } },
    { name: "GET Reason Code By ID", method: "GET", path: "/reason-codes/1" },
    { name: "PUT Update Reason Code", method: "PUT", path: "/reason-codes/1", body: { description: "Updated description" } },
    { name: "DELETE Reason Code", method: "DELETE", path: "/reason-codes/1" }
  ]),
  createFolder("Batches", [
    { name: "GET All Batches", method: "GET", path: "/batches" },
    { name: "POST Create Batch", method: "POST", path: "/batches", body: { product_id: 1, batch_number: "B-001", expiry_date: "2026-12-31", initial_quantity: 100 } },
    { name: "GET Batch By ID", method: "GET", path: "/batches/1" },
    { name: "PUT Update Batch", method: "PUT", path: "/batches/1", body: { batch_number: "B-001-UPDATED" } }
  ]),
  createFolder("Orders", [
    { name: "GET All Orders", method: "GET", path: "/orders" },
    { name: "POST Create Order (IN)", method: "POST", path: "/orders", body: { order_type: "IN", destination_location_id: 1, supplier_id: 1, items: [{ product_id: 1, quantity: 50, unit_price: 100 }] } },
    { name: "GET Order By ID", method: "GET", path: "/orders/1" }
  ]),
  createFolder("Adjustments", [
    { name: "GET All Adjustments", method: "GET", path: "/adjustments" },
    { name: "POST Create Adjustment (DECREASE)", method: "POST", path: "/adjustments", body: { product_id: 1, location_id: 1, adjustment_type: "DECREASE", quantity_change: 5, reason_code_id: 1, notes: "Spoilage" } },
    { name: "GET Adjustment By ID", method: "GET", path: "/adjustments/1" }
  ])
];

folders.forEach(f => {
  const existingIdx = coll.item.findIndex(i => i.name === f.name);
  if (existingIdx >= 0) coll.item[existingIdx] = f;
  else coll.item.push(f);
});

fs.writeFileSync(collPath, JSON.stringify(coll, null, 2));
console.log('Postman collection finalized with all missing modules.');
