"""Generate postman/Invex_Collection.json: every Invex endpoint, in run order, with status checks.

Run: python3 postman/build_collection.py
The collection creates its own test data (ids saved as environment variables) and deletes it at the end.
Credentials come from the environment (adminUsername / adminPassword), never from this file.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ITEMS = []                                   # (folder, item)


def req(folder, name, method, path, status, body=None, token='adminToken', save=None, script='', form=None,
        query=None):
    """One request. `status` may be an int or a list of acceptable codes. `save` maps env var -> JS expression."""
    codes = status if isinstance(status, list) else [status]
    test = [f"pm.test('status {'/'.join(map(str, codes))}', () => pm.expect(pm.response.code).to.be.oneOf({codes}));"]
    for var, expr in (save or {}).items():
        test.append(f"if ({codes}.includes(pm.response.code)) pm.environment.set('{var}', String({expr}));")
    if script:
        test.append(script)
    raw = '{{baseUrl}}' + path + (('?' + '&'.join(f'{k}={v}' for k, v in query.items())) if query else '')
    r = {'method': method, 'header': [], 'url': raw}
    if token:
        r['auth'] = {'type': 'bearer', 'bearer': [{'key': 'token', 'value': '{{' + token + '}}', 'type': 'string'}]}
    else:
        r['auth'] = {'type': 'noauth'}
    if body is not None:
        r['header'].append({'key': 'Content-Type', 'value': 'application/json'})
        r['body'] = {'mode': 'raw', 'raw': body if isinstance(body, str) else json.dumps(body, indent=2),
                     'options': {'raw': {'language': 'json'}}}
    if form:
        r['body'] = {'mode': 'formdata', 'formdata': form}
    ITEMS.append((folder, {'name': name, 'request': r,
                           'event': [{'listen': 'test', 'script': {'type': 'text/javascript', 'exec': test}}]}))


J = 'pm.response.json()'
RUN = '{{run}}'

# ── Auth ──
req('Auth', 'Login (super admin)', 'POST', '/auth/login', 200,
    {'username': '{{adminUsername}}', 'password': '{{adminPassword}}'}, token=None,
    save={'adminToken': f'{J}.token'},
    script="pm.environment.set('run', String(Date.now()).slice(-8)); pm.environment.set('staffPassword', 'StaffTest2026x');")
req('Auth', 'Login – wrong password (401)', 'POST', '/auth/login', 401,
    {'username': '{{adminUsername}}', 'password': 'not-the-password'}, token=None)
req('Auth', 'Register a new hire', 'POST', '/auth/register', 201,
    {'username': f'pm_hire_{RUN}', 'password': '{{staffPassword}}', 'full_name': 'Postman New Hire',
     'email': f'pm_hire_{RUN}@example.test'}, token=None)
req('Auth', 'Register as super admin – refused (403)', 'POST', '/auth/register', 403,
    {'username': f'pm_bad_{RUN}', 'password': '{{staffPassword}}', 'full_name': 'Not Allowed',
     'email': f'pm_bad_{RUN}@example.test', 'role': 'super_admin'}, token=None)
req('Auth', 'Login (new hire)', 'POST', '/auth/login', 200,
    {'username': f'pm_hire_{RUN}', 'password': '{{staffPassword}}'}, token=None, save={'staffToken': f'{J}.token'})
req('Auth', 'Get me (new hire)', 'GET', '/auth/me', 200, token='staffToken',
    save={'staffUserId': f'({J}.data || {J}.user).id'})
req('Auth', 'Change password (new hire)', 'PUT', '/auth/change-password', 200,
    {'current_password': '{{staffPassword}}', 'new_password': 'StaffTest2026y'}, token='staffToken',
    script="if (pm.response.code === 200) pm.environment.set('staffPassword', 'StaffTest2026y');")
req('Auth', 'Get products – no token (401)', 'GET', '/products', 401, token=None)

# ── Locations ──
req('Locations', 'Create location A', 'POST', '/locations', 201,
    {'name': f'Postman Warehouse {RUN}', 'code': f'PMA{RUN}', 'type': 'warehouse', 'color': '#336699'},
    save={'locationId': f'{J}.data.id'})
req('Locations', 'Create location B', 'POST', '/locations', 201,
    {'name': f'Postman Store {RUN}', 'code': f'PMB{RUN}', 'type': 'store', 'color': '#993366'},
    save={'locationId2': f'{J}.data.id'})
req('Locations', 'Get all locations', 'GET', '/locations', 200)
req('Locations', 'Get location by id', 'GET', '/locations/{{locationId}}', 200)
req('Locations', 'Update location', 'PUT', '/locations/{{locationId}}', 200,
    {'name': f'Postman Warehouse {RUN} (edited)', 'code': f'PMA{RUN}', 'type': 'warehouse', 'color': '#336699'})
req('Locations', 'Location summary', 'GET', '/locations/summary', 200)
req('Locations', 'Inventory matrix', 'GET', '/locations/inventory-matrix', 200)

# ── Categories, suppliers, reason codes ──
req('Categories', 'Create category', 'POST', '/categories', 201,
    {'name': f'Postman Category {RUN}', 'description': 'Created by the Postman run', 'color': '#336699'},
    save={'categoryId': f'{J}.data.id'})
req('Categories', 'Get all categories', 'GET', '/categories', 200)
req('Categories', 'Get category by id', 'GET', '/categories/{{categoryId}}', 200)
req('Categories', 'Update category', 'PUT', '/categories/{{categoryId}}', 200,
    {'name': f'Postman Category {RUN} (edited)', 'description': 'Edited', 'color': '#336699'})
req('Suppliers', 'Create supplier', 'POST', '/suppliers', 201,
    {'name': f'Postman Supplier {RUN}', 'contact_person': 'Test Contact', 'phone': '09170000000',
     'email': f'supplier_{RUN}@example.test', 'address_line': '1 Test Street', 'city': 'Dipolog'},
    save={'supplierId': f'{J}.data.id'})
req('Suppliers', 'Get all suppliers', 'GET', '/suppliers', 200)
req('Suppliers', 'Get supplier by id', 'GET', '/suppliers/{{supplierId}}', 200)
req('Suppliers', 'Update supplier', 'PUT', '/suppliers/{{supplierId}}', 200,
    {'name': f'Postman Supplier {RUN} (edited)', 'contact_person': 'Test Contact'})
req('Reason Codes', 'Create reason code', 'POST', '/reason-codes', 201,
    {'code': f'PM_{RUN}', 'description': 'Postman test reason', 'adjustment_type': 'BOTH'},
    save={'reasonCodeId': f'{J}.data.id'})
req('Reason Codes', 'Get all reason codes', 'GET', '/reason-codes', 200)
req('Reason Codes', 'Get reason code by id', 'GET', '/reason-codes/{{reasonCodeId}}', 200)

# ── Products ──
req('Products', 'Get next SKU', 'GET', '/products/next-sku', 200, query={'location_id': '{{locationId}}'})
req('Products', 'Create product', 'POST', '/products', 201,
    {'name': f'Postman Product {RUN}', 'location_id': '{{locationId}}', 'category_id': '{{categoryId}}',
     'supplier_id': '{{supplierId}}', 'unit_price': 25.5, 'reorder_level': 5, 'track_expiry': True,
     'expiry_date': '2027-06-30', 'initial_quantity': 50},
    save={'productId': f'{J}.data.id'})
req('Products', 'Create product – staff token (403)', 'POST', '/products', 403,
    {'name': 'Should not exist', 'location_id': '{{locationId}}', 'category_id': '{{categoryId}}', 'unit_price': 1},
    token='staffToken')
req('Products', 'Create product – missing fields (400)', 'POST', '/products', 400, {'name': 'Missing fields'})
req('Products', 'Get all products', 'GET', '/products', 200)
req('Products', 'Get product by id', 'GET', '/products/{{productId}}', 200)
req('Products', 'Get product stock', 'GET', '/products/{{productId}}/stock', 200)
req('Products', 'Update product', 'PUT', '/products/{{productId}}', 200,
    {'name': f'Postman Product {RUN} (edited)', 'unit_price': 27.75, 'reorder_level': 100000})  # forces a low-stock alert
req('Products', 'Set product stock', 'POST', '/products/{{productId}}/set-stock', 200, {'target_quantity': 60})
req('Products', 'Adjust product stock per location', 'POST', '/products/{{productId}}/adjust-stock', 200,
    {'changes': [{'location_id': '{{locationId}}', 'target_quantity': 70}]})
req('Products', 'Product history', 'GET', '/products/{{productId}}/history', 200)

# ── Batches ──
req('Batches', 'Create batch', 'POST', '/batches', 201,
    {'product_id': '{{productId}}', 'location_id': '{{locationId}}', 'batch_no': f'PMB-{RUN}', 'quantity': 10,
     'expiry_date': '2027-01-31'}, save={'batchId': f'{J}.data.id'})
req('Batches', 'Get all batches', 'GET', '/batches', 200)
req('Batches', 'Get expiring batches', 'GET', '/batches/expiring', 200, query={'days': 400})
req('Batches', 'Get batch by id', 'GET', '/batches/{{batchId}}', 200)
req('Batches', 'Update batch', 'PUT', '/batches/{{batchId}}', 200,
    {'batch_no': f'PMB-{RUN}', 'quantity': 12, 'expiry_date': '2027-02-28'})

# ── Orders ──
req('Orders', 'Stock-in order', 'POST', '/orders', 201,
    {'order_type': 'IN', 'destination_location_id': '{{locationId}}', 'supplier_id': '{{supplierId}}',
     'notes': 'Postman stock-in', 'items': [{'product_id': '{{productId}}', 'quantity': 10, 'unit_price': 25.5}]},
    save={'orderId': f'{J}.data.id'})
req('Orders', 'Stock-out order', 'POST', '/orders', 201,
    {'order_type': 'OUT', 'source_location_id': '{{locationId}}', 'notes': 'Postman stock-out',
     'items': [{'product_id': '{{productId}}', 'quantity': 2, 'unit_price': 30}]})
req('Orders', 'Stock-out – insufficient stock (400)', 'POST', '/orders', 400,
    {'order_type': 'OUT', 'source_location_id': '{{locationId}}',
     'items': [{'product_id': '{{productId}}', 'quantity': 999999, 'unit_price': 30}]})
req('Orders', 'Transfer order', 'POST', '/orders', 201,
    {'order_type': 'TRANSFER', 'source_location_id': '{{locationId}}', 'destination_location_id': '{{locationId2}}',
     'items': [{'product_id': '{{productId}}', 'quantity': 3, 'unit_price': 25.5}]})
req('Orders', 'Get all orders', 'GET', '/orders', 200)
req('Orders', 'Get order by id', 'GET', '/orders/{{orderId}}', 200)
req('Orders', 'Update order', 'PUT', '/orders/{{orderId}}', 200,
    {'reference_no': f'PM-REF-{RUN}', 'notes': 'Edited by Postman'})

# ── Transfers ──
req('Transfers', 'Create transfer', 'POST', '/transfers', 201,
    {'product_id': '{{productId}}', 'from_location_id': '{{locationId}}', 'to_location_id': '{{locationId2}}',
     'quantity': 3, 'notes': 'Postman transfer'}, save={'transferId': f'{J}.data.id'})
req('Transfers', 'Create transfer – insufficient stock (400)', 'POST', '/transfers', 400,
    {'product_id': '{{productId}}', 'from_location_id': '{{locationId}}', 'to_location_id': '{{locationId2}}',
     'quantity': 999999})
req('Transfers', 'Get all transfers', 'GET', '/transfers', 200)
req('Transfers', 'Get transfer by id', 'GET', '/transfers/{{transferId}}', 200)

# ── Adjustments ──
req('Adjustments', 'Create adjustment (increase)', 'POST', '/adjustments', 201,
    {'product_id': '{{productId}}', 'location_id': '{{locationId}}', 'adjustment_type': 'INCREASE',
     'quantity_change': 4, 'reason_code_id': '{{reasonCodeId}}', 'notes': 'Postman adjustment'},
    save={'adjustmentId': f'{J}.data.id'})
req('Adjustments', 'Create adjustment – no reason code (400)', 'POST', '/adjustments', 400,
    {'product_id': '{{productId}}', 'location_id': '{{locationId}}', 'adjustment_type': 'INCREASE', 'quantity_change': 1})
req('Adjustments', 'Get all adjustments', 'GET', '/adjustments', 200)
req('Adjustments', 'Get adjustment by id', 'GET', '/adjustments/{{adjustmentId}}', 200)

# ── Stock import, file import and export ──
req('Import - Export', 'Import stock into locations', 'POST', '/locations/import-stock', [200, 201],
    {'product_id': '{{productId}}', 'allocations': [{'location_id': '{{locationId2}}', 'quantity': 5}],
     'notes': 'Postman import'})
req('Import - Export', 'Import products (upload CSV)', 'POST', '/import/products', 200,
    form=[{'key': 'file', 'type': 'file', 'src': 'fixtures/products-import.csv'}],
    script=("if (pm.response.code === 200) { const b = pm.response.json(); const rows = (b.data && (b.data.rows || b.data)) "
            "|| b.rows || []; pm.environment.set('importRows', JSON.stringify(rows.map(r => Object.assign({}, r, "
            "{ name: r.name + ' ' + pm.environment.get('run'), location_id: Number(pm.environment.get('locationId')), "
            "category_id: Number(pm.environment.get('categoryId')) })))); }"))
req('Import - Export', 'Commit imported products', 'POST', '/import/products/commit', [200, 201],
    '{\n  "rows": {{importRows}}\n}')
req('Import - Export', 'Export products', 'GET', '/export/products', 200)
req('Import - Export', 'Export stock report', 'GET', '/export/stock-report', 200)
req('Import - Export', 'Export movement log', 'GET', '/export/movement-log', 200)

# ── Reports and dashboard ──
req('Reports', 'Dashboard data', 'GET', '/reports/dashboard', 200)
req('Reports', 'Low-stock report', 'GET', '/reports/low-stock', 200)
req('Reports', 'Expiring batches report', 'GET', '/reports/expiring', 200, query={'days': 30})
req('Reports', 'Stock summary', 'GET', '/reports/stock-summary', 200)
req('Reports', 'Movement log', 'GET', '/reports/movement-log', 200)
req('Reports', 'Urgent batches (dashboard)', 'GET', '/dashboard/urgent-batches', 200)

# ── Notifications and activity log ──
req('Notifications', 'Run notification scan', 'POST', '/notifications/scan', 200)
req('Notifications', 'Run scan – staff token (403)', 'POST', '/notifications/scan', 403, token='staffToken')
req('Notifications', 'List notifications', 'GET', '/notifications', 200,
    script=("if (pm.response.code === 200) { const b = pm.response.json(); const list = b.data && (b.data.items || "
            "b.data.notifications || b.data); if (Array.isArray(list) && list.length) "
            "pm.environment.set('notificationId', String(list[0].id)); }"))
req('Notifications', 'Mark one read', 'POST', '/notifications/{{notificationId}}/read', 200)
req('Notifications', 'Mark all read', 'POST', '/notifications/read-all', 200)
req('Activity Logs', 'List activity logs', 'GET', '/activity-logs', 200, query={'page': 1, 'limit': 20})
req('Activity Logs', 'Activity log facets', 'GET', '/activity-logs/facets', 200)
req('Activity Logs', 'Activity logs – staff token (403)', 'GET', '/activity-logs', 403, token='staffToken')

# ── Users ──
req('Users', 'Create user (staff)', 'POST', '/users', 201,
    {'username': f'pm_user_{RUN}', 'password': 'StaffTest2026x', 'full_name': 'Postman Staff User',
     'email': f'pm_user_{RUN}@example.test', 'role': 'staff', 'location_id': '{{locationId}}'},
    save={'userId': f'{J}.data.id'})
req('Users', 'Get all users', 'GET', '/users', 200)
req('Users', 'Get user by id', 'GET', '/users/{{userId}}', 200)
req('Users', 'Update user', 'PUT', '/users/{{userId}}', 200,
    {'full_name': 'Postman Staff User (edited)', 'role': 'staff', 'location_id': '{{locationId}}'})
req('Users', 'Get users – staff token (403)', 'GET', '/users', 403, token='staffToken')

# ── Clean-up (soft deletes, super admin) ──
req('Clean-up', 'Delete product – staff token (403)', 'DELETE', '/products/{{productId}}', 403, token='staffToken')
req('Clean-up', 'Delete transfer', 'DELETE', '/transfers/{{transferId}}', 200)
req('Clean-up', 'Delete adjustment', 'DELETE', '/adjustments/{{adjustmentId}}', 200)
req('Clean-up', 'Delete order', 'DELETE', '/orders/{{orderId}}', 200)
req('Clean-up', 'Delete batch', 'DELETE', '/batches/{{batchId}}', 200)
req('Clean-up', 'Delete product', 'DELETE', '/products/{{productId}}', 200)
req('Clean-up', 'Delete user', 'DELETE', '/users/{{userId}}', 200)
req('Clean-up', 'Delete new hire', 'DELETE', '/users/{{staffUserId}}', 200)
req('Clean-up', 'Delete reason code', 'DELETE', '/reason-codes/{{reasonCodeId}}', 200)
req('Clean-up', 'Delete supplier', 'DELETE', '/suppliers/{{supplierId}}', 200)
req('Clean-up', 'Delete category (409 while products still use it)', 'DELETE', '/categories/{{categoryId}}', [200, 409])
req('Clean-up', 'Delete location B (409 while it holds stock)', 'DELETE', '/locations/{{locationId2}}', [200, 409])
req('Clean-up', 'Delete location A (409 while it holds stock)', 'DELETE', '/locations/{{locationId}}', [200, 409])
req('Auth', 'Log out', 'POST', '/auth/logout', 200)

folders = {}
for folder, item in ITEMS:
    folders.setdefault(folder, [])
order = list(folders)
collection = {
    'info': {'name': 'Invex API', 'description': (
        'Every Invex endpoint in run order. Set adminUsername and adminPassword in the environment (never commit '
        'them), run the whole collection on a test copy of the database, and every request checks its status. '
        'Ids created along the way are saved as environment variables and deleted again in Clean-up.'),
        'schema': 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},
    'item': [{'name': f, 'item': [it for fo, it in ITEMS if fo == f]} for f in order],
}
# keep run order across folders: flatten in the order written, grouping consecutive items
groups, last = [], None
for folder, item in ITEMS:
    if folder != last:
        groups.append({'name': folder, 'item': []})
        last = folder
    groups[-1]['item'].append(item)
collection['item'] = groups
(HERE / 'Invex_Collection.json').write_text(json.dumps(collection, indent=2, ensure_ascii=False) + '\n')
env = {'name': 'Invex Local', 'values': [
    {'key': 'baseUrl', 'value': 'http://localhost:3000/api', 'enabled': True},
    {'key': 'adminUsername', 'value': '', 'enabled': True},
    {'key': 'adminPassword', 'value': '', 'type': 'secret', 'enabled': True},
    {'key': 'adminToken', 'value': '', 'enabled': True},
    {'key': 'staffToken', 'value': '', 'enabled': True}]}
(HERE / 'Invex_Environment.json').write_text(json.dumps(env, indent=2) + '\n')
print('requests:', len(ITEMS))
