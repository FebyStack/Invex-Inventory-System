#!/usr/bin/env node
/**
 * Behaviour snapshot of every endpoint that changes stock inside a transaction (adjustments, orders, transfers,
 * set-stock / adjust-stock, import-stock, product create). For each call it records the HTTP status, message,
 * stock change at two locations, and how many connections were left inside an open transaction.
 *
 * Use it to prove a refactor changed nothing: run it before and after, then diff the two files.
 * Run it ONLY against a local copy of the database (see "Safe test run" in PROJECT.md); it reads stock with psql.
 *
 *   INVEX_URL=http://localhost:3100 INVEX_DB=invex_smoke INVEX_ADMIN=<super admin> INVEX_SUB=<sub admin with a location> \
 *   INVEX_PASS=<password of both> node scripts/stock-behaviour-check.js > before.json
 */
const { execSync } = require('child_process');
const BASE = process.env.INVEX_URL || 'http://localhost:3100';
const PW = process.env.INVEX_PASS;
const DB = process.env.INVEX_DB;
const ADMIN = process.env.INVEX_ADMIN;
const SUB = process.env.INVEX_SUB;
if (!PW || !DB || !ADMIN || !SUB || !/^\w+$/.test(DB)) {
  console.error('Set INVEX_DB (local test database), INVEX_ADMIN, INVEX_SUB and INVEX_PASS.');
  process.exit(2);
}
const out = [];

const sql = (q) => execSync(`psql -U postgres -d ${DB} -Atc "set search_path=invex; ${q}"`).toString().trim().split('\n').pop();

async function call(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

async function login(username) {
  const r = await call(null, 'POST', '/api/auth/login', { username, password: PW });
  if (!r.json || !r.json.token) throw new Error(`login failed for ${username}: ${r.status}`);
  return r.json.token;
}

(async () => {
  const admin = await login(ADMIN);
  const sub = await login(SUB);
  const subLoc = Number(sql(`select location_id from users where username='${SUB.replace(/[^\w.-]/g, '')}'`));

  // Product with stock at the sub admin's location (A) and any other location (B).
  const P = Number(sql(`select product_id from product_stock ps join active_products p on p.id=ps.product_id where location_id=${subLoc} and quantity>=20 order by product_id limit 1`));
  const A = subLoc;
  const B = Number(sql(`select id from active_locations where id<>${A} order by id limit 1`));
  const reason = Number(sql("select id from reason_codes where adjustment_type='BOTH' and is_deleted=false order by id limit 1"));
  const reasonT = Number(sql("select id from reason_codes where code='TRANSFER' and is_deleted=false limit 1")) || reason;

  const stock = () => {
    const a = Number(sql(`select coalesce((select quantity from product_stock where product_id=${P} and location_id=${A}),0)`));
    const b = Number(sql(`select coalesce((select quantity from product_stock where product_id=${P} and location_id=${B}),0)`));
    return [a, b];
  };

  const step = async (name, token, method, path, body) => {
    const before = stock();
    const r = await call(token, method, path, body);
    const after = stock();
    out.push({
      name,
      status: r.status,
      success: r.json && r.json.success,
      code: r.json && r.json.code,
      message: r.json && String(r.json.message || '').replace(/\d+/g, 'N'),
      dA: after[0] - before[0],
      dB: after[1] - before[1],
      openTx: Number(sql(`select count(*) from pg_stat_activity where datname='${DB}' and state like 'idle in transaction%'`)),
    });
    return r.json && r.json.data;
  };

  const adj = (type, qty, extra = {}) => ({ product_id: P, location_id: A, adjustment_type: type, quantity_change: qty, reason_code_id: type === 'TRANSFER' ? reasonT : reason, ...extra });

  // --- adjustments ---
  const a1 = await step('adj INCREASE 3', admin, 'POST', '/api/adjustments', adj('INCREASE', 3));
  const a2 = await step('adj DECREASE 2', admin, 'POST', '/api/adjustments', adj('DECREASE', 2));
  const a3 = await step('adj TRANSFER 1', admin, 'POST', '/api/adjustments', adj('TRANSFER', 1, { to_location_id: B }));
  await step('adj DECREASE too much', admin, 'POST', '/api/adjustments', adj('DECREASE', 99999999));
  await step('adj TRANSFER too much', admin, 'POST', '/api/adjustments', adj('TRANSFER', 99999999, { to_location_id: B }));
  await step('adj bad type', admin, 'POST', '/api/adjustments', adj('FOO', 1));
  await step('adj missing fields', admin, 'POST', '/api/adjustments', { product_id: P });
  await step('adj same location transfer', admin, 'POST', '/api/adjustments', adj('TRANSFER', 1, { to_location_id: A }));
  await step('adj bad reason', admin, 'POST', '/api/adjustments', { ...adj('INCREASE', 1), reason_code_id: 99999999 });
  await step('adj fractional qty', admin, 'POST', '/api/adjustments', adj('INCREASE', 1.5));
  await step('adj sub other location', sub, 'POST', '/api/adjustments', { ...adj('INCREASE', 1), location_id: B });
  await step('adj sub own location', sub, 'POST', '/api/adjustments', adj('INCREASE', 1));
  await step('adj delete INCREASE', admin, 'DELETE', `/api/adjustments/${a1 && a1.id}`);
  await step('adj delete DECREASE', admin, 'DELETE', `/api/adjustments/${a2 && a2.id}`);
  await step('adj delete TRANSFER', admin, 'DELETE', `/api/adjustments/${a3 && a3.id}`);
  await step('adj delete missing', admin, 'DELETE', '/api/adjustments/99999999');

  // --- orders ---
  const item = (q) => [{ product_id: P, quantity: q, unit_price: 1 }];
  const o1 = await step('order IN 4', admin, 'POST', '/api/orders', { order_type: 'IN', destination_location_id: A, items: item(4) });
  const o2 = await step('order OUT 2', admin, 'POST', '/api/orders', { order_type: 'OUT', source_location_id: A, items: item(2) });
  const o3 = await step('order TRANSFER 1', admin, 'POST', '/api/orders', { order_type: 'TRANSFER', source_location_id: A, destination_location_id: B, items: item(1) });
  await step('order OUT too much', admin, 'POST', '/api/orders', { order_type: 'OUT', source_location_id: A, items: item(99999999) });
  await step('order bad type', admin, 'POST', '/api/orders', { order_type: 'FOO', source_location_id: A, destination_location_id: B, items: item(1) });
  await step('order no items', admin, 'POST', '/api/orders', { order_type: 'IN', destination_location_id: A, items: [] });
  await step('order IN no destination', admin, 'POST', '/api/orders', { order_type: 'IN', items: item(1) });
  await step('order sub other location', sub, 'POST', '/api/orders', { order_type: 'IN', destination_location_id: B, items: item(1) });
  await step('order sub own location', sub, 'POST', '/api/orders', { order_type: 'IN', destination_location_id: A, items: item(1) });
  out.push({ name: 'order ref generated', ok: !!(o1 && /^IN-/.test(o1.reference_no)) && !!(o3 && /^TRF-/.test(o3.reference_no)) });
  await step('order delete IN', admin, 'DELETE', `/api/orders/${o1 && o1.id}`);
  await step('order delete OUT', admin, 'DELETE', `/api/orders/${o2 && o2.id}`);
  await step('order delete TRANSFER', admin, 'DELETE', `/api/orders/${o3 && o3.id}`);
  await step('order delete missing', admin, 'DELETE', '/api/orders/99999999');

  // --- transfers ---
  await step('transfer 1', admin, 'POST', '/api/transfers', { from_location_id: A, to_location_id: B, product_id: P, quantity: 1 });
  await step('transfer back 1', admin, 'POST', '/api/transfers', { from_location_id: B, to_location_id: A, product_id: P, quantity: 1 });
  await step('transfer too much', admin, 'POST', '/api/transfers', { from_location_id: A, to_location_id: B, product_id: P, quantity: 99999999 });
  await step('transfer same location', admin, 'POST', '/api/transfers', { from_location_id: A, to_location_id: A, product_id: P, quantity: 1 });
  await step('transfer bad batch', admin, 'POST', '/api/transfers', { from_location_id: A, to_location_id: B, product_id: P, quantity: 1, batch_id: 99999999 });
  await step('transfer zero qty', admin, 'POST', '/api/transfers', { from_location_id: A, to_location_id: B, product_id: P, quantity: 0 });

  // --- products: set-stock / adjust-stock ---
  const [curA, curB] = stock();
  await step('adjust-stock +5 at A', admin, 'POST', `/api/products/${P}/adjust-stock`, { changes: [{ location_id: A, target_quantity: curA + 5 }] });
  await step('adjust-stock back', admin, 'POST', `/api/products/${P}/adjust-stock`, { changes: [{ location_id: A, target_quantity: curA }] });
  await step('adjust-stock negative', admin, 'POST', `/api/products/${P}/adjust-stock`, { changes: [{ location_id: A, target_quantity: -1 }] });
  await step('adjust-stock empty', admin, 'POST', `/api/products/${P}/adjust-stock`, { changes: [] });
  await step('adjust-stock sub other location', sub, 'POST', `/api/products/${P}/adjust-stock`, { changes: [{ location_id: B, target_quantity: curB + 1 }] });
  const total = Number(sql(`select coalesce(sum(quantity),0) from product_stock where product_id=${P}`));
  await step('set-stock +2 at A', admin, 'POST', `/api/products/${P}/set-stock`, { target_quantity: total + 2, location_id: A });
  await step('set-stock back', admin, 'POST', `/api/products/${P}/set-stock`, { target_quantity: total, location_id: A });
  await step('set-stock no change', admin, 'POST', `/api/products/${P}/set-stock`, { target_quantity: total });
  await step('set-stock bad target', admin, 'POST', `/api/products/${P}/set-stock`, { target_quantity: -3 });
  await step('set-stock drop too far at A', admin, 'POST', `/api/products/${P}/set-stock`, { target_quantity: 0, location_id: B });
  await step('set-stock sub other location', sub, 'POST', `/api/products/${P}/set-stock`, { target_quantity: total + 1, location_id: B });
  await step('set-stock sub default location', sub, 'POST', `/api/products/${P}/set-stock`, { target_quantity: total + 1 });
  await step('set-stock sub back', sub, 'POST', `/api/products/${P}/set-stock`, { target_quantity: total });
  await step('set-stock missing product', admin, 'POST', '/api/products/99999999/set-stock', { target_quantity: 1 });

  // --- locations import-stock ---
  await step('import-stock 2 at A', admin, 'POST', '/api/locations/import-stock', { product_id: P, allocations: [{ location_id: A, quantity: 2 }] });
  await step('import-stock none valid', admin, 'POST', '/api/locations/import-stock', { product_id: P, allocations: [{ location_id: A, quantity: 0 }] });
  await step('import-stock bad location', admin, 'POST', '/api/locations/import-stock', { product_id: P, allocations: [{ location_id: 99999999, quantity: 1 }] });

  // --- products create ---
  const cat = Number(sql('select id from active_categories order by id limit 1'));
  const np = await step('product create', admin, 'POST', '/api/products', { name: `FSM check ${Date.now()}`, location_id: A, category_id: cat, unit_price: 1, initial_quantity: 3 });
  out.push({ name: 'product create seeded stock', qty: np ? Number(sql(`select coalesce(sum(quantity),0) from product_stock where product_id=${np.id}`)) : null, hasSku: !!(np && np.sku) });
  await step('product create bad location', admin, 'POST', '/api/products', { name: 'FSM bad loc', location_id: 99999999, category_id: cat, unit_price: 1 });
  await step('product create missing fields', admin, 'POST', '/api/products', { name: 'x' });
  await step('product create bad category', admin, 'POST', '/api/products', { name: `FSM bad cat ${Date.now()}`, location_id: A, category_id: 99999999, unit_price: 1 });
  await step('product create sub other location', sub, 'POST', '/api/products', { name: 'FSM sub', location_id: B, category_id: cat, unit_price: 1 });
  if (np) await step('product delete', admin, 'DELETE', `/api/products/${np.id}`);

  // --- notifications scan (single-flight must still return the same shape) ---
  const scans = await Promise.all([1, 2, 3].map(() => call(admin, 'POST', '/api/notifications/scan')));
  out.push({ name: 'scan x3 concurrent', statuses: scans.map((s) => s.status), shape: scans.map((s) => Object.keys((s.json && s.json.data) || {}).sort().join(',')) });

  // --- health + leaked transactions ---
  const h = await call(null, 'GET', '/api/health');
  out.push({ name: 'health', status: h.status });
  await new Promise((r) => setTimeout(r, 1500));
  out.push({
    name: 'connections left inside a transaction',
    count: Number(sql(`select count(*) from pg_stat_activity where datname='${DB}' and state like 'idle in transaction%'`)),
  });
  out.push({ name: 'net stock drift', drift: stock().map((v, i) => v - [curA, curB][i]) });

  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
