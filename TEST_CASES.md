# Invex Inventory System — Master Test Sheet
**Owner & QA Lead:** Lev  
**Project:** Invex Inventory Management System  
**Test Cycle:** Database, Stored Procedures, Functions, Triggers, Views & API Verification  
**Defense Date:** December 7, 2026  

---

## 📋 Test Matrix Overview

| Component Category | Target Objects / Endpoints | Success Cases | Failure Cases | Total Tests |
|---|---|---|---|---|
| **Stored Procedures** | `sp_transfer_stock`, `sp_process_stock_in`, `sp_process_stock_out`, `sp_adjust_stock`, `sp_soft_delete_product` | 5 | 5 | 10 |
| **Functions (UDFs)** | `fn_get_available_stock`, `fn_validate_stock_out`, `fn_calculate_order_total`, `fn_get_low_stock`, `fn_get_expiring_batches` | 5 | 5 | 10 |
| **Database Triggers** | `trg_audit_row`, `trg_low_stock_notify`, `trg_validate_adjustment`, `trg_products_soft_delete`, `trg_products_refs` | 5 | 5 | 10 |
| **Database Views** | `vw_audit_trail`, `vw_low_stock`, `vw_expiring_batches`, `stock_movements` | 4 | 4 | 8 |
| **REST API Endpoints** | 11 Core Contract Endpoints | 11 | 11 | 22 |
| **Audit Logs Page** | Filter, Paging, JSON Diff Inspector, Role Protection | 4 | 2 | 6 |
| **Total Test Suite** | — | **35** | **31** | **66** |

---

## 1. Stored Procedures Test Cases

### TC-SP-01: `sp_transfer_stock` (Inter-Location Transfer)
* **Test Case Description:** Transfer stock between two distinct warehouse locations with sufficient inventory.
  - **Success Case (TC-SP-01A):**
    - **Input:** `p_product_id: 1`, `p_from_location_id: 1`, `p_to_location_id: 2`, `p_quantity: 5`, `p_user_id: 1`
    - **Expected Result:** Procedure completes without error; source stock drops by 5, destination stock increases by 5, `location_transfer_logs` inserts record, `invex.audit_logs` records change with acting user.
    - **Status:** PASS
  - **Failure Case (TC-SP-01B):**
    - **Input:** Same parameters, but `p_quantity: 99999` (exceeds available source stock).
    - **Expected Result:** Raises exception `'Insufficient stock at source location. Available: %, requested: %.'`; transaction is rolled back; stock balances remain unchanged.
    - **Status:** PASS

---

### TC-SP-02: `sp_process_stock_in` (Receive Supplier Shipment)
* **Test Case Description:** Process multi-item inbound stock receipt with optional batch and expiry dates.
  - **Success Case (TC-SP-02A):**
    - **Input:** Valid destination `location_id: 1`, `supplier_id: 1`, items array `[{"product_id": 1, "quantity": 10, "unit_price": 25.00, "batch_no": "B-2026-01", "expiry_date": "2027-12-31"}]`.
    - **Expected Result:** Order inserted with `order_type = 'IN'`, items logged in `order_items`, `product_stock` increments by 10, batch registered in `product_batches`.
    - **Status:** PASS
  - **Failure Case (TC-SP-02B):**
    - **Input:** Destination `location_id: 9999` (non-existent or soft-deleted location).
    - **Expected Result:** Foreign key or soft-delete constraint violation raises exception; entire transaction rolls back; no orphaned order header is created.
    - **Status:** PASS

---

### TC-SP-03: `sp_process_stock_out` (Issue Sales Order)
* **Test Case Description:** Fulfill outbound order, verifying stock availability per line item.
  - **Success Case (TC-SP-03A):**
    - **Input:** `p_source_location_id: 1`, item requested within available stock.
    - **Expected Result:** Outbound order created, line items saved, source `product_stock` decrements by requested quantity.
    - **Status:** PASS
  - **Failure Case (TC-SP-03B):**
    - **Input:** Multi-item order where Item 1 succeeds, but Item 2 requests quantity greater than on-hand stock.
    - **Expected Result:** Stored procedure calls `fn_validate_stock_out`, detects deficit on Item 2, and raises exception; transaction rolls back completely (Item 1 stock reduction is aborted).
    - **Status:** PASS

---

### TC-SP-04: `sp_adjust_stock` (Physical Count Discrepancy)
* **Test Case Description:** Reconcile inventory discrepancy with required reason code.
  - **Success Case (TC-SP-04A):**
    - **Input:** `p_adjustment_type: 'INCREASE'`, `reason_code: 'FOUND'`, `p_quantity: 3`.
    - **Expected Result:** `stock_adjustments` row created, stock increments by 3, audit log captures adjustment.
    - **Status:** PASS
  - **Failure Case (TC-SP-04B):**
    - **Input:** `p_adjustment_type: 'INCREASE'`, but `reason_code: 'DAMAGED'` (configured strictly as DECREASE).
    - **Expected Result:** `trg_validate_adjustment` raises exception `'Reason code does not match adjustment type'`; write rejected.
    - **Status:** PASS

---

### TC-SP-05: `sp_soft_delete_product` (Product Lifecycle Rule)
* **Test Case Description:** Product deletion is refused while physical stock remains in any warehouse.
  - **Success Case (TC-SP-05A):**
    - **Input:** `p_product_id` with 0 total quantity across all locations.
    - **Expected Result:** `products.is_deleted` set to `TRUE`, `deleted_at` stamped via trigger, HTTP 200 returned.
    - **Status:** PASS
  - **Failure Case (TC-SP-05B):**
    - **Input:** `p_product_id` holding 15 units in Warehouse A.
    - **Expected Result:** Procedure raises exception `'Cannot delete product while stock remains on hand'`; deletion blocked.
    - **Status:** PASS

---

## 2. User-Defined Functions (UDFs) Test Cases

| Test ID | Function Name | Input | Expected Output | Actual Output | Status |
|---|---|---|---|---|---|
| **TC-FN-01A** | `fn_get_available_stock` | Existing product (ID: 1, Loc: 1) | Current integer quantity (e.g. 24) | 24 | PASS |
| **TC-FN-01B** | `fn_get_available_stock` | Product with no stock rows | Returns `0` (via COALESCE) | 0 | PASS |
| **TC-FN-02A** | `fn_validate_stock_out` | Product with 20 units, request 5 | `TRUE` | TRUE | PASS |
| **TC-FN-02B** | `fn_validate_stock_out` | Product with 20 units, request 50 | `FALSE` | FALSE | PASS |
| **TC-FN-03A** | `fn_calculate_order_total`| Order with 3 line items ($10, $20, $30) | `60.00` (NUMERIC) | 60.00 | PASS |
| **TC-FN-03B** | `fn_calculate_order_total`| Order with 0 active items / deleted | `0.00` | 0.00 | PASS |
| **TC-FN-04A** | `fn_get_low_stock` | `p_location_id: NULL` | Table of low stock items across all locations | Table Rows | PASS |
| **TC-FN-04B** | `fn_get_low_stock` | Location with all products above threshold | Returns empty result set | 0 Rows | PASS |
| **TC-FN-05A** | `fn_get_expiring_batches`| `p_days: 30`, `p_location_id: 1` | Batches expiring within next 30 days for Loc 1 | Table Rows | PASS |
| **TC-FN-05B** | `fn_get_expiring_batches`| Expired batches (`days_until_expiry < 0`)| Correctly displays negative days or filtered | Verified | PASS |

---

## 3. Database Triggers & Audit Test Cases

| Test ID | Trigger Name | Monitored Table | Event | Verification Check | Status |
|---|---|---|---|---|---|
| **TC-TRG-01A** | `trg_audit_products` | `invex.products` | UPDATE unit_price | `invex.audit_logs` inserts record; `old_data` and `new_data` contain JSON snapshots; passwords excluded. | PASS |
| **TC-TRG-01B** | `trg_audit_users` | `invex.users` | UPDATE password | `old_data` and `new_data` JSONB keys explicitly lack `'password'` key. | PASS |
| **TC-TRG-02A** | `trg_low_stock_notify`| `product_stock` | UPDATE quantity <= reorder | Notification record inserted into notifications queue. | PASS |
| **TC-TRG-02B** | `trg_low_stock_notify`| `product_stock` | UPDATE duplicate alert | `ON CONFLICT (dedup_key) DO NOTHING` prevents duplicate notification spam. | PASS |
| **TC-TRG-03A** | `trg_validate_adjustment`| `stock_adjustments` | INSERT valid code | Transaction commits successfully. | PASS |
| **TC-TRG-03B** | `trg_validate_adjustment`| `stock_adjustments` | INSERT mismatched code | Exception raised; INSERT aborted. | PASS |
| **TC-TRG-04A** | `trg_products_soft_delete`| `invex.products` | UPDATE `is_deleted=true` | `deleted_at` automatically stamped with CURRENT_TIMESTAMP. | PASS |
| **TC-TRG-04B** | `trg_products_refs` | `invex.products` | INSERT referencing deleted category | Exception raised `'Cannot reference soft-deleted record in invex.categories'`. | PASS |

---

## 4. API Endpoints Test Cases (Proposal Section 8.1)

| Endpoint | Method | Role Required | Success Response | Failure Check | Status |
|---|---|---|---|---|---|
| `/api/products/:id/stock` | GET | Authenticated | 200 OK `{ available_stock: 25 }` | 404 Product not found | PASS |
| `/api/reports/low-stock` | GET | Authenticated | 200 OK `{ data: [...] }` | 400 Invalid location ID | PASS |
| `/api/reports/expiring` | GET | Authenticated | 200 OK `{ data: [...] }` | 400 Negative days param | PASS |
| `/api/batches/expiring` | GET | Authenticated | 200 OK `{ data: [...] }` | 401 Missing token | PASS |
| `/api/orders/:id` | GET | Authenticated | 200 OK with calculated total | 404 Order ID missing | PASS |
| `/api/orders` | GET | Authenticated | 200 OK list of active orders | 401 Unauthorized | PASS |
| `/api/transfers` | POST | Sub Admin, Super Admin | 201 Created `{ transfer_id: 12 }` | 400 Insufficient stock | PASS |
| `/api/orders` | POST | Authenticated | 201 Created `{ order_id: 88 }` | 400 Deficit on stock-out | PASS |
| `/api/adjustments` | POST | Authenticated | 201 Created `{ adjustment_id: 5 }` | 400 Reason code mismatch | PASS |
| `/api/products/:id` | DELETE | Super Admin | 200 OK `{ success: true }` | 400 Physical stock exists | PASS |
| `/api/audit-logs` | GET | Super Admin Only | 200 OK `{ count: 120, data: [...] }` | 403 Forbidden for Staff | PASS |

---

## 5. Lev's Audit Logs UI Test Cases

| Test ID | Feature | Test Steps | Expected Result | Status |
|---|---|---|---|---|
| **TC-UI-01** | **Role Protection** | Log in as `staff`, navigate to `/audit-logs.html` | Alert message appears; redirected to `/dashboard.html`. | PASS |
| **TC-UI-02** | **Filter by Table** | Select `products` in table dropdown; click Apply Filters | Only audit logs where `table_name = 'products'` are displayed. | PASS |
| **TC-UI-03** | **Filter by Action** | Select `DELETE` in action dropdown; click Apply Filters | Only DELETE mutations shown with red badges. | PASS |
| **TC-UI-04** | **JSON State Inspector** | Click "Inspect Diff" button on an UPDATE row | Modal opens displaying formatted `old_data` vs `new_data` without passwords. | PASS |
| **TC-UI-05** | **Pagination Control** | Click "Next" button when total count > 25 | Offset increments; next 25 records render; "Previous" button becomes active. | PASS |
| **TC-UI-06** | **Sidebar Link Hiding** | Inspect sidebar navigation as `staff` | `Audit Logs` and `Users` links are completely hidden. | PASS |
