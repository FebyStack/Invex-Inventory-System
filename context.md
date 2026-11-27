# Invex: system context

Everything a new teammate (or an AI assistant) needs to work on Invex without re-reading the code. Checked
against the repo and the live database on 2026-11-23. Day-to-day state and decisions are in `PROJECT.md`.

## 1. What it is

Invex is a web-based inventory management system for an organisation with several stock locations
(storerooms, warehouses, stores). It tracks products, how many of each sit at each location, batches with
expiry dates, stock coming in and going out, adjustments, transfers between locations, and who did what.

Built in May 2026 for the Information Management course. From November 23, 2026 it is being extended for the
Advanced Database Systems final project: five PL/pgSQL functions, five stored procedures, a trigger-written
audit trail, new triggers and views, and API endpoints that call them.

- Repo: `FebyStack/Invex-Inventory-System`, branch `main`.
- Team: Febriel (project manager, procedures), Leo (schema, audit, triggers, views, ERD), Aaron (functions,
  API, Postman), Lev (diagrams, proposal, frontend, testing).

## 2. Stack

| Layer | What |
| --- | --- |
| Runtime | Node.js, CommonJS, one process started with `npm start` (`node server.js`), port 3000 |
| API | Express 4, JSON, mounted under `/api` |
| Database | PostgreSQL, schema `invex`, driver `pg` with a connection pool and `search_path=invex` |
| Auth | JWT in the `Authorization: Bearer` header, passwords hashed with bcrypt |
| Realtime | WebSocket at `/ws` (`ws` package), token passed as `?token=` |
| Frontend | Plain HTML, CSS and JavaScript served by the same Express process. No framework, no build step |
| Files | Multer uploads; CSV and Excel import/export with Papaparse and ExcelJS |
| Email | Nodemailer, optional. Without SMTP settings the alerts stay in-app |

## 3. Run it

```
npm install
npm start                                   # http://localhost:3000
INVEX_PASS=<admin password> ./scripts/smoke-test.sh   # needs curl and jq, server running
```

Configuration is `backend/.env` (gitignored). Keys: `PORT`, `NODE_ENV`, `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `UPLOAD_DIR`, `MAX_FILE_SIZE`. Optional: `SMTP_HOST`,
`SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `NOTIF_SCAN_INTERVAL_MS` (0 turns the scanner
off). If `JWT_SECRET` is missing the code falls back to a default string, so always set it.

Database setup, two ways:

1. Restore the team's database script (schema and data): `createdb invex`, then `psql -d invex -f <script>`.
   This is the reliable way.
2. From the repo files: `database/database.sql`, then every file in `database/migrations/` in name order
   (`004b` included). `database.sql` prints "already exists" errors on the way; see section 11.

Febriel's local database is named `inventory_db` (user `postgres`); teammates use `invex`. The name only
matters in `backend/.env`.

A new database has no admin: `/register.html` creates `staff` accounts only. Promote one by hand:
`UPDATE invex.users SET role = 'super_admin', location_id = NULL WHERE username = '<name>';`

## 4. Folder map

```
server.js                  starts HTTP, WebSocket and the notification scanner
backend/
  src/app.js               Express app: middleware, static files, route mounting
  src/config/              env.js (reads backend/.env), db.js (pg pool, query helper)
  src/models/              stockModel.js, locationSkuModel.js
  src/utils/               logger.js (activity log), locationScope.js, passwordPolicy.js, csv/excel helpers
  routes/                  one file per resource, 16 files
  controllers/             request handling and validation, 16 files
  models/                  SQL for each resource, 13 files
  middleware/              authMiddleware, roleMiddleware, errorMiddleware, uploadMiddleware
  services/                notificationService (scanner, email), realtimeService (WebSocket)
frontend/
  public/                  19 HTML pages
  js/                      one script per page, plus api.js, sidebar.js, role-guard.js, notifications.js
  css/                     one stylesheet per page, plus style.css, tables.css, forms.css, sidebar.css
  components/              sidebar.html, header.html, modal.html
database/
  database.sql             base schema
  migrations/              001_notifications, 002_location_skus, 003_product_notes, 004_user_roles,
                           004b_transfer_adjustments
postman/                   Invex_Collection.json, Invex_Environment.json
scripts/smoke-test.sh      end-to-end check
```

`backend/` and `backend/src/` both hold some helpers (`logger`, `csvHelper`, `excelHelper`,
`uploadMiddleware`). The controllers import from `backend/src/utils`. Leave the duplicates alone.

## 5. How a request travels

Browser page script, `fetch` with the token from `sessionStorage`, Express route, `authenticate` (verifies the
JWT and sets `req.user = { id, username, role, location_id }`), `authorize(...roles)`, controller (validates
input, applies location scope), model (SQL through the pool), JSON back as `{ success, data }` or
`{ success: false, message }`.

Errors thrown in a controller reach `errorHandler` in `backend/middleware/errorMiddleware.js`, which uses
`err.statusCode` (default 500) and `err.message`.

Writes that touch several tables take a client from the pool and run `BEGIN`, the statements, `COMMIT`, with
`ROLLBACK` in the `catch`. Today this is done in the controllers for orders, adjustments, transfers, products,
locations and imports.

## 6. Roles and location scope

| Role | Sees | Can do |
| --- | --- | --- |
| `super_admin` | every location | everything, including users, categories, suppliers, locations, reason codes, imports, activity log |
| `sub_admin` | only their assigned location | create products, orders, adjustments and transfers that involve their location; no edits or deletes |
| `staff` | only their assigned location | create orders and adjustments, adjust stock; no deletes |

`sub_admin` and `staff` must have `users.location_id` set; `super_admin` has NULL. The id is also inside the
JWT. `resolveLocationScope` in `backend/middleware/roleMiddleware.js` decides which location a request may read;
controllers call it through `scopeLocation(req, res, requestedLocationId)`.

Known gap: the update and delete handlers for products, orders, adjustments, transfers and batches do not check
the record's location. As a stopgap (2026-11-23) those nine routes, including every batch write, are
`super_admin` only. Give them back to sub admins only together with a location check in each handler.

Passwords need at least 12 characters with upper case, lower case and a number.

## 7. Database

Schema `invex`. 14 tables, 16 triggers, 9 views, 7 trigger functions, 0 stored procedures.

### Tables

| Table | Holds | Key columns |
| --- | --- | --- |
| `users` | accounts | `username`, `password` (bcrypt), `full_name`, `email`, `role`, `location_id` |
| `categories` | product categories | `name`, `color` |
| `suppliers` | suppliers | `name`, contact and address fields |
| `locations` | stock locations | `name`, `code` (unique), `type` (warehouse, store, storeroom), `color` |
| `products` | product catalogue | `name`, `sku` (unique), `category_id`, `supplier_id`, `unit_price`, `reorder_level`, `track_expiry`, `unit_of_measure`, `notes` |
| `product_stock` | quantity of one product at one location | `product_id`, `location_id` (unique together), `quantity` (never below 0), `location_sku`, `last_updated` |
| `product_batches` | batches with expiry | `product_id`, `location_id`, `batch_no` (unique together), `quantity`, `expiry_date`, `received_date` |
| `orders` | stock-in, stock-out and transfer orders | `order_type` (IN, OUT, TRANSFER), `source_location_id`, `destination_location_id`, `supplier_id`, `user_id`, `reference_no`, `notes` |
| `order_items` | lines of an order | `order_id`, `product_id`, `batch_id`, `quantity`, `unit_price` |
| `stock_adjustments` | manual corrections | `product_id`, `location_id`, `to_location_id`, `adjustment_type` (INCREASE, DECREASE, TRANSFER), `quantity_change`, `reason_code_id`, `user_id` |
| `reason_codes` | why an adjustment happened | `code`, `description`, `adjustment_type` (INCREASE, DECREASE, BOTH, TRANSFER) |
| `location_transfer_logs` | transfers made through `/api/transfers` or a TRANSFER order | `from_location_id`, `to_location_id`, `product_id`, `batch_id`, `quantity`, `transferred_by` |
| `activity_logs` | what users did, written by the API | `user_id`, `action`, `entity_type`, `entity_id`, `details` (text), `location_id` |
| `notifications` | low-stock and expiry alerts | `type`, `severity`, `dedup_key` (unique), `title`, `body`, `link`, `is_read`, `email_sent` |

Most tables have `is_deleted`, `deleted_at` and `created_at`. `product_stock`, `activity_logs` and
`notifications` are never soft-deleted.

### Relationships

- A product belongs to one category and optionally one supplier.
- `product_stock` joins products and locations, one row per pair. A trigger creates the zero rows when a product
  or a location is added.
- A batch belongs to one product at one location.
- An order has many order items; an item points at a product and optionally a batch.
- Adjustments, transfer logs, orders and activity logs each point at the user who made them.
- A sub admin or staff user points at one location.

### Triggers and functions that exist

| Trigger | Does |
| --- | --- |
| `trg_<table>_soft_delete` (11 tables) | when `is_deleted` flips to true, `set_deleted_at()` stamps `deleted_at` |
| `trg_products_refs`, `trg_orders_refs`, `trg_order_items_refs` | refuse a row that points at a soft-deleted category, supplier, location, product or order |
| `trg_seed_stock_on_product_insert`, `trg_seed_stock_on_location_insert` | create the zero-quantity `product_stock` rows |

### Views

`active_categories`, `active_suppliers`, `active_locations`, `active_products`, `active_orders`,
`active_transfer_logs` (live rows only); `stock_movements` (orders, adjustments and transfers as one movement
list); `location_stock_summary` (totals, out-of-stock and expiring counts per location);
`transfer_log_details` (transfer log joined to names and SKUs).

## 8. Business rules

- **Stock never goes below zero.** The column has a CHECK, and every decrease runs
  `UPDATE ... WHERE quantity >= amount`; no updated row means "Insufficient stock".
- **Location SKUs.** A product has a base `sku`. The first time it holds stock at a location it gets a
  `location_sku` of the form `<location code>-<number>`, generated in `backend/src/models/locationSkuModel.js`
  under an advisory lock. The low-stock report only lists stock rows that have one.
- **Stock in** (`POST /api/orders`, type IN): creates the order and its items, creates or tops up a batch when
  `batch_no` and `expiry_date` are sent, raises stock at the destination.
- **Stock out** (type OUT): creates the order and items, lowers stock at the source.
- **Transfers** happen three ways: an order of type TRANSFER, an adjustment of type TRANSFER (what the
  Adjustments page does), or `POST /api/transfers` (not used by any page). Only the first and third write
  `location_transfer_logs`.
- **Adjustments** need a reason code whose type is `BOTH` or equals the adjustment type.
- **Soft delete.** Nothing is removed. `DELETE` endpoints set `is_deleted = TRUE`.
- **Order references.** When none is given, one is generated from the order type, id and the items' SKUs.
- **Notifications.** A scanner runs every 15 minutes and after each stock write. Per product it compares the
  total across locations with `reorder_level` and creates `LOW_STOCK` or `OUT_OF_STOCK`; per batch it creates
  `EXPIRING_BATCH` (within 7 days) or `EXPIRED_BATCH`. `dedup_key` stops duplicates. New ones are pushed over
  the WebSocket and, when SMTP is set, emailed.
- **Activity log.** Controllers call `logActivity(userId, action, entityType, entityId, details, locationId)`
  after a successful write. It is free text and separate from the planned audit trail.

## 9. API

All under `/api`. Every route needs a valid token except register and login.

| Area | Endpoints | Who |
| --- | --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/change-password` | anyone; register creates staff |
| Users | `GET, POST /users`, `GET, PUT, DELETE /users/:id` | super admin |
| Products | `GET /products`, `GET /products/next-sku`, `GET /products/:id`, `GET /products/:id/stock`, `GET /products/:id/history` | all roles |
| | `POST /products` | super admin, sub admin |
| | `PUT /products/:id`, `DELETE /products/:id` | super admin |
| | `POST /products/:id/set-stock`, `POST /products/:id/adjust-stock` | all roles |
| Categories, Suppliers | `GET` list and by id for all; `POST`, `PUT`, `DELETE` | super admin for writes |
| Locations | `GET /locations`, `/locations/summary`, `/locations/inventory-matrix`, `/locations/:id` for all; `POST`, `PUT`, `DELETE`, `POST /locations/import-stock` | super admin for writes |
| Batches | `GET /batches`, `/batches/expiring`, `/batches/:id` for all; `POST`, `PUT`, `DELETE` | super admin for writes |
| Orders | `GET /orders`, `GET /orders/:id`, `POST /orders` for all; `PUT`, `DELETE /orders/:id` | super admin for edit and delete |
| Adjustments | `GET /adjustments`, `GET /adjustments/:id`, `POST /adjustments` for all; `DELETE /adjustments/:id` | super admin for delete |
| Transfers | `GET /transfers`, `GET /transfers/:id`, `POST /transfers` for all; `DELETE /transfers/:id` | super admin for delete |
| Reason codes | `GET` for all; `POST`, `DELETE` | super admin for writes |
| Reports | `GET /reports/dashboard`, `/low-stock`, `/expiring`, `/stock-summary`, `/movement-log` | all roles, scoped by location |
| Dashboard | `GET /dashboard/urgent-batches` | all roles |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`; `POST /notifications/scan` | scan is super admin |
| Activity log | `GET /activity-logs`, `GET /activity-logs/facets` | super admin |
| Import, export | `POST /import/products`, `POST /import/products/commit` (super admin); `GET /export/products`, `/export/stock-report`, `/export/movement-log` | |

## 10. Frontend

Pages in `frontend/public`: `login`, `register`, `dashboard`, `products`, `product-form`, `categories`,
`suppliers`, `locations`, `batches`, `orders`, `adjustments`, `stock-history`, `reports`, `import-export`,
`users`, `reason-codes`, `activity-log`, `profile`, and `index`.

- The token and the user object live in `sessionStorage` (`token`, `user`). The theme is in `localStorage`.
- `frontend/js/api.js` exports `fetchApi`, which adds the token and sends the user to the login page on a 401.
  Several page scripts call `fetch` directly with the same header.
- `frontend/components/sidebar.html` is the menu; `frontend/js/sidebar.js` maps each label to its page and
  shows items with class `admin-item` to super admins only.
- `frontend/js/role-guard.js` blocks pages whose `<body>` has `data-admin-only`.
- The notification bell reads `/api/notifications` and listens on `/ws`.

## 11. Known gaps

- **`database/database.sql` plus migrations 001 to 004 are behind the database.** They lack
  `stock_adjustments.to_location_id`, the `TRANSFER` value in the CHECK constraints of `stock_adjustments` and
  `reason_codes`, and four indexes. Migration `004b_transfer_adjustments.sql` adds them; always run it.
- `database/database.sql` is three versions pasted together and raises 22 "already exists" errors on an empty
  database, though it still finishes.
- Location scope is missing inside the update and delete handlers; the routes are locked to super admin
  meanwhile (section 6). The pages still show edit and delete buttons to sub admins.
- The live database has a leftover `public.categories` table that nothing uses.
- No automated tests beyond the smoke script (`scripts/smoke-test.sh`, 39 checks; needs a `super_admin` login via
  `INVEX_USER`/`INVEX_PASS`). `frontend/js/auth.js` is empty. No README.

## 12. What the Advanced Database project adds

Names are fixed in the project plan; this is the short version.

| Kind | Objects |
| --- | --- |
| Functions | `fn_get_available_stock`, `fn_validate_stock_out`, `fn_calculate_order_total`, `fn_get_low_stock`, `fn_get_expiring_batches` |
| Procedures | `sp_transfer_stock`, `sp_process_stock_in`, `sp_process_stock_out`, `sp_adjust_stock`, `sp_soft_delete_product` |
| Table | `audit_logs`: old and new row as JSONB, written only by triggers |
| Triggers | `trg_audit_<table>` on five tables, `trg_products_set_updated_at`, `trg_orders_set_updated_at`, `trg_validate_adjustment`, `trg_low_stock_notify` |
| Views | `vw_low_stock`, `vw_expiring_batches`, `vw_audit_trail` |
| API | `GET /api/audit-logs`; existing stock endpoints call the functions and procedures through `backend/src/utils/callProcedure.js` |
| Frontend | `audit-log.html`, order totals, database error messages shown to the user |

How the pieces fit: the API opens a transaction, makes sure location SKUs exist, runs `CALL invex.sp_...`, and
commits. A procedure first runs `set_config('app.user_id', <user id>, true)`, so the audit trigger can read who
made the change with `current_setting('app.user_id', true)`. A broken rule raises an exception; the API rolls
back and answers 400 with the database's message. Procedures never commit on their own.

Migration files, one owner each: `004b` and `005_audit_logs` (Leo), `006_functions` (Aaron),
`007_procedures` (Febriel), `008_triggers` and `009_views` (Leo).

## 13. Conventions

- Branch `advdb/<name>-<task>`, pull request into `main`, Febriel reviews.
- SQL objects are always written with the schema: `invex.products`.
- Migrations can be run twice without error and are applied with
  `psql -v ON_ERROR_STOP=1 -d <database> -f database/migrations/<file>.sql`.
- API responses keep the shape `{ success, data }` or `{ success: false, message }`.
- New function, procedure, trigger and view names follow the plan's prefixes: `fn_`, `sp_`, `trg_`, `vw_`.
