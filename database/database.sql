-- ============================================================
-- INVEX — Full Database Schema
-- Run this file against a fresh 'inventory_db' database
-- ============================================================

-- Create the invex schema
CREATE SCHEMA IF NOT EXISTS invex;

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE invex.categories (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL UNIQUE,
    description  TEXT,
    is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stores supplier information for Invex stock-in transactions
CREATE TABLE invex.suppliers (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    contact_person  VARCHAR(100),
    phone           VARCHAR(20),
    email           VARCHAR(100),
    address_line    VARCHAR(255),
    barangay        VARCHAR(100),
    city            VARCHAR(100),
    province        VARCHAR(100),
    postal_code     VARCHAR(10),
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stores warehouses, stores, and storerooms managed by Invex
CREATE TABLE invex.locations (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    code          VARCHAR(20)  NOT NULL UNIQUE,
    address_line  VARCHAR(255),
    barangay      VARCHAR(100),
    city          VARCHAR(100),
    province      VARCHAR(100),
    postal_code   VARCHAR(10),
    type          VARCHAR(30)  NOT NULL
                  CHECK (type IN ('warehouse', 'store', 'storeroom')),
    is_deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at    TIMESTAMP,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Predefined codes for Invex stock adjustment entries
CREATE TABLE invex.reason_codes (
    id               SERIAL PRIMARY KEY,
    code             VARCHAR(30)  NOT NULL UNIQUE,
    description      VARCHAR(255) NOT NULL,
    adjustment_type  VARCHAR(20)  NOT NULL
                     CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'BOTH')),
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at       TIMESTAMP,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Invex system users — admins and staff
CREATE TABLE invex.users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(50)  NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    full_name   VARCHAR(100) NOT NULL,
    email       VARCHAR(100),
    role        VARCHAR(20)  NOT NULL CHECK (role IN ('admin', 'staff')),
    is_deleted  BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Products tracked in the Invex inventory
CREATE TABLE invex.products (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(100)   NOT NULL,
    sku              VARCHAR(50)    NOT NULL UNIQUE,
    category_id      INTEGER        NOT NULL REFERENCES invex.categories(id),
    supplier_id      INTEGER        NOT NULL REFERENCES invex.suppliers(id),
    unit_price       DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    reorder_level    INTEGER        NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    track_expiry     BOOLEAN        NOT NULL DEFAULT FALSE,
    unit_of_measure  VARCHAR(20)    NOT NULL DEFAULT 'pcs',
    is_deleted       BOOLEAN        NOT NULL DEFAULT FALSE,
    deleted_at       TIMESTAMP,
    created_at       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Current on-hand quantity per product per location in Invex
-- Maintained transactionally on every order and adjustment
CREATE TABLE invex.product_stock (
    id            SERIAL  PRIMARY KEY,
    product_id    INTEGER NOT NULL REFERENCES invex.products(id),
    location_id   INTEGER NOT NULL REFERENCES invex.locations(id),
    quantity      INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    last_updated  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (product_id, location_id)
);

-- Individual stock batches with expiry dates (Invex batch tracking)
-- Only used for products where track_expiry = TRUE
CREATE TABLE invex.product_batches (
    id             SERIAL  PRIMARY KEY,
    product_id     INTEGER NOT NULL REFERENCES invex.products(id),
    location_id    INTEGER NOT NULL REFERENCES invex.locations(id),
    batch_no       VARCHAR(50) NOT NULL,
    quantity       INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    expiry_date    DATE        NOT NULL,
    received_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
    is_deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
    deleted_at     TIMESTAMP,
    created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (product_id, location_id, batch_no)
);

-- Invex stock movement transactions — stock-in, stock-out, transfers
CREATE TABLE invex.orders (
    id                       SERIAL  PRIMARY KEY,
    order_type               VARCHAR(20) NOT NULL
                             CHECK (order_type IN ('IN', 'OUT', 'TRANSFER')),
    source_location_id       INTEGER REFERENCES invex.locations(id),
    destination_location_id  INTEGER REFERENCES invex.locations(id),
    supplier_id              INTEGER REFERENCES invex.suppliers(id),
    user_id                  INTEGER NOT NULL REFERENCES invex.users(id),
    order_date               TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reference_no             VARCHAR(50),
    notes                    TEXT,
    is_deleted               BOOLEAN     NOT NULL DEFAULT FALSE,
    deleted_at               TIMESTAMP,
    created_at               TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Line items for each Invex order (products + quantities per transaction)
CREATE TABLE invex.order_items (
    id          SERIAL         PRIMARY KEY,
    order_id    INTEGER        NOT NULL REFERENCES invex.orders(id),
    product_id  INTEGER        NOT NULL REFERENCES invex.products(id),
    batch_id    INTEGER        REFERENCES invex.product_batches(id),
    quantity    INTEGER        NOT NULL CHECK (quantity > 0),
    unit_price  DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    is_deleted  BOOLEAN        NOT NULL DEFAULT FALSE,
    deleted_at  TIMESTAMP
);

-- Manual stock corrections recorded in Invex with a required reason code
CREATE TABLE invex.stock_adjustments (
    id               SERIAL  PRIMARY KEY,
    product_id       INTEGER NOT NULL REFERENCES invex.products(id),
    location_id      INTEGER NOT NULL REFERENCES invex.locations(id),
    batch_id         INTEGER REFERENCES invex.product_batches(id),
    adjustment_type  VARCHAR(20) NOT NULL
                     CHECK (adjustment_type IN ('INCREASE', 'DECREASE')),
    quantity_change  INTEGER     NOT NULL CHECK (quantity_change > 0),
    reason_code_id   INTEGER     NOT NULL REFERENCES invex.reason_codes(id),
    notes            TEXT,
    user_id          INTEGER     NOT NULL REFERENCES invex.users(id),
    adjustment_date  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN     NOT NULL DEFAULT FALSE,
    deleted_at       TIMESTAMP
);

-- Full audit trail of all user actions performed in Invex
CREATE TABLE invex.activity_logs (
    id           SERIAL  PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES invex.users(id),
    action       VARCHAR(50) NOT NULL,
    entity_type  VARCHAR(50),
    entity_id    INTEGER,
    details      TEXT,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. PERFORMANCE INDEXES
-- ============================================================

-- Expiry alert queries (dashboard + batch list)
CREATE INDEX idx_invex_batches_expiry
    ON invex.product_batches(expiry_date)
    WHERE is_deleted = FALSE;

-- Per-product movement history
CREATE INDEX idx_invex_order_items_product
    ON invex.order_items(product_id);

CREATE INDEX idx_invex_adjustments_product
    ON invex.stock_adjustments(product_id);

-- Order list filtering
CREATE INDEX idx_invex_orders_date
    ON invex.orders(order_date DESC);

CREATE INDEX idx_invex_orders_type
    ON invex.orders(order_type);

-- Activity log lookups
CREATE INDEX idx_invex_activity_user
    ON invex.activity_logs(user_id, created_at DESC);

-- Product search
CREATE INDEX idx_invex_products_sku
    ON invex.products(sku)
    WHERE is_deleted = FALSE;

CREATE INDEX idx_invex_products_category
    ON invex.products(category_id);

CREATE INDEX idx_invex_products_supplier
    ON invex.products(supplier_id);

-- Partial indexes for active records
CREATE INDEX idx_categories_active   ON invex.categories(id)          WHERE is_deleted = FALSE;
CREATE INDEX idx_suppliers_active    ON invex.suppliers(id)           WHERE is_deleted = FALSE;
CREATE INDEX idx_locations_active    ON invex.locations(id)           WHERE is_deleted = FALSE;
CREATE INDEX idx_reason_codes_active ON invex.reason_codes(id)        WHERE is_deleted = FALSE;
CREATE INDEX idx_users_active        ON invex.users(id)               WHERE is_deleted = FALSE;
CREATE INDEX idx_products_active     ON invex.products(id)            WHERE is_deleted = FALSE;
CREATE INDEX idx_orders_active       ON invex.orders(id)              WHERE is_deleted = FALSE;
CREATE INDEX idx_batches_active      ON invex.product_batches(id)     WHERE is_deleted = FALSE;
CREATE INDEX idx_adjustments_active  ON invex.stock_adjustments(id)   WHERE is_deleted = FALSE;

-- ============================================================
-- 3. SOFT DELETE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION invex.set_deleted_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        NEW.deleted_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_categories_soft_delete
BEFORE UPDATE ON invex.categories
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_suppliers_soft_delete
BEFORE UPDATE ON invex.suppliers
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_locations_soft_delete
BEFORE UPDATE ON invex.locations
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_reason_codes_soft_delete
BEFORE UPDATE ON invex.reason_codes
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_users_soft_delete
BEFORE UPDATE ON invex.users
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_products_soft_delete
BEFORE UPDATE ON invex.products
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_batches_soft_delete
BEFORE UPDATE ON invex.product_batches
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_orders_soft_delete
BEFORE UPDATE ON invex.orders
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_adjustments_soft_delete
BEFORE UPDATE ON invex.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_order_items_soft_delete
BEFORE UPDATE ON invex.order_items
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

-- ============================================================
-- 4. REFERENTIAL INTEGRITY FOR SOFT DELETES
-- ============================================================

CREATE OR REPLACE FUNCTION invex.prevent_soft_deleted_reference(
    table_name TEXT,
    id_value INTEGER
)
RETURNS VOID AS $$
DECLARE
    is_del BOOLEAN;
BEGIN
    EXECUTE format('SELECT is_deleted FROM %s WHERE id = $1', table_name)
    INTO is_del
    USING id_value;

    IF is_del THEN
        RAISE EXCEPTION 'Cannot reference soft-deleted record in %', table_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- PRODUCTS → category, supplier
CREATE OR REPLACE FUNCTION invex.trg_products_check_refs()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM invex.prevent_soft_deleted_reference('invex.categories', NEW.category_id);
    PERFORM invex.prevent_soft_deleted_reference('invex.suppliers', NEW.supplier_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_refs
BEFORE INSERT OR UPDATE ON invex.products
FOR EACH ROW EXECUTE FUNCTION invex.trg_products_check_refs();

-- ORDERS → supplier, user
CREATE OR REPLACE FUNCTION invex.trg_orders_check_refs()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.supplier_id IS NOT NULL THEN
        PERFORM invex.prevent_soft_deleted_reference('invex.suppliers', NEW.supplier_id);
    END IF;

    PERFORM invex.prevent_soft_deleted_reference('invex.users', NEW.user_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_refs
BEFORE INSERT OR UPDATE ON invex.orders
FOR EACH ROW EXECUTE FUNCTION invex.trg_orders_check_refs();

-- ORDER ITEMS → product
CREATE OR REPLACE FUNCTION invex.trg_order_items_check_refs()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM invex.prevent_soft_deleted_reference('invex.products', NEW.product_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_refs
BEFORE INSERT OR UPDATE ON invex.order_items
FOR EACH ROW EXECUTE FUNCTION invex.trg_order_items_check_refs();

-- ============================================================
-- 5. VIEWS
-- ============================================================

CREATE OR REPLACE VIEW invex.active_categories AS
SELECT * FROM invex.categories WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW invex.active_suppliers AS
SELECT * FROM invex.suppliers WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW invex.active_locations AS
SELECT * FROM invex.locations WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW invex.active_products AS
SELECT * FROM invex.products WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW invex.active_orders AS
SELECT * FROM invex.orders WHERE is_deleted = FALSE;

-- Unified stock movements ledger (orders + adjustments)
CREATE OR REPLACE VIEW invex.stock_movements AS

SELECT
    oi.id AS movement_id,
    o.order_date AS movement_date,
    CASE o.order_type
        WHEN 'IN' THEN oi.quantity
        WHEN 'OUT' THEN -oi.quantity
        ELSE 0
    END AS quantity_change,
    oi.product_id,
    oi.batch_id,
    COALESCE(o.destination_location_id, o.source_location_id) AS location_id,
    o.user_id,
    NULL::INTEGER AS reason_code_id,
    'ORDER'::TEXT AS source_type,
    o.id AS source_id,
    o.notes
FROM invex.order_items oi
JOIN invex.orders o ON oi.order_id = o.id
WHERE o.is_deleted = FALSE
  AND (oi.is_deleted = FALSE OR oi.is_deleted IS NULL)

UNION ALL

SELECT
    sa.id,
    sa.adjustment_date,
    CASE sa.adjustment_type
        WHEN 'INCREASE' THEN sa.quantity_change
        WHEN 'DECREASE' THEN -sa.quantity_change
    END,
    sa.product_id,
    sa.batch_id,
    sa.location_id,
    sa.user_id,
    sa.reason_code_id,
    'ADJUSTMENT'::TEXT,
    sa.id,
    sa.notes
FROM invex.stock_adjustments sa
WHERE sa.is_deleted = FALSE;

-- ============================================================
-- 6. SEED DATA — Default reason codes
-- ============================================================

INSERT INTO invex.reason_codes (code, description, adjustment_type) VALUES
    ('DAMAGED',   'Item damaged or unusable',            'DECREASE'),
    ('LOST',      'Item lost or missing',                'DECREASE'),
    ('EXPIRED',   'Item expired and removed from stock', 'DECREASE'),
    ('THEFT',     'Stolen item',                         'DECREASE'),
    ('FOUND',     'Item found during stock check',       'INCREASE'),
    ('RETURNED',  'Item returned to inventory',          'INCREASE'),
    ('RECOUNT',   'Quantity correction after recount',   'BOTH'),
    ('OTHER',     'Other reason — see notes field',      'BOTH');


-- Apply to all soft-deletable tables
ALTER TABLE invex.categories        ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE invex.suppliers         ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE invex.locations         ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE invex.reason_codes      ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE invex.users             ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE invex.products          ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE invex.product_batches   ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE invex.orders            ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE invex.stock_adjustments ADD COLUMN deleted_at TIMESTAMP;


-- ============================================================
-- INVEX — SOFT DELETE + DATA INTEGRITY UPGRADE
-- ============================================================

-- ============================================================
-- 1. ADD deleted_at COLUMN (keeps is_deleted for compatibility)
-- ============================================================

ALTER TABLE invex.categories        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invex.suppliers         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invex.locations         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invex.reason_codes      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invex.users             ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invex.products          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invex.product_batches   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invex.orders            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE invex.stock_adjustments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Optional: enable soft delete for order_items
ALTER TABLE invex.order_items
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- ============================================================
-- 2. PARTIAL INDEXES (ACTIVE RECORDS ONLY)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_categories_active ON invex.categories(id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_suppliers_active  ON invex.suppliers(id)  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_locations_active  ON invex.locations(id)  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_reason_codes_active ON invex.reason_codes(id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_users_active      ON invex.users(id)      WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_products_active   ON invex.products(id)   WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_orders_active     ON invex.orders(id)     WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_batches_active    ON invex.product_batches(id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_adjustments_active ON invex.stock_adjustments(id) WHERE is_deleted = FALSE;

-- ============================================================
-- 3. AUTO-SET deleted_at WHEN SOFT DELETING
-- ============================================================

CREATE OR REPLACE FUNCTION invex.set_deleted_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_deleted = TRUE AND OLD.is_deleted = FALSE THEN
        NEW.deleted_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all soft-delete tables

CREATE TRIGGER trg_categories_soft_delete
BEFORE UPDATE ON invex.categories
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_suppliers_soft_delete
BEFORE UPDATE ON invex.suppliers
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_locations_soft_delete
BEFORE UPDATE ON invex.locations
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_reason_codes_soft_delete
BEFORE UPDATE ON invex.reason_codes
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_users_soft_delete
BEFORE UPDATE ON invex.users
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_products_soft_delete
BEFORE UPDATE ON invex.products
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_batches_soft_delete
BEFORE UPDATE ON invex.product_batches
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_orders_soft_delete
BEFORE UPDATE ON invex.orders
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_adjustments_soft_delete
BEFORE UPDATE ON invex.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

CREATE TRIGGER trg_order_items_soft_delete
BEFORE UPDATE ON invex.order_items
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

-- ============================================================
-- 4. PREVENT REFERENCING SOFT-DELETED RECORDS
-- ============================================================

CREATE OR REPLACE FUNCTION invex.prevent_soft_deleted_reference(
    table_name TEXT,
    id_value INTEGER
)
RETURNS VOID AS $$
DECLARE
    is_del BOOLEAN;
BEGIN
    EXECUTE format('SELECT is_deleted FROM %s WHERE id = $1', table_name)
    INTO is_del
    USING id_value;

    IF is_del THEN
        RAISE EXCEPTION 'Cannot reference soft-deleted record in %', table_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- PRODUCTS → category, supplier

CREATE OR REPLACE FUNCTION invex.trg_products_check_refs()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM invex.prevent_soft_deleted_reference('invex.categories', NEW.category_id);
    PERFORM invex.prevent_soft_deleted_reference('invex.suppliers', NEW.supplier_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_refs
BEFORE INSERT OR UPDATE ON invex.products
FOR EACH ROW EXECUTE FUNCTION invex.trg_products_check_refs();

-- ORDERS → supplier, user

CREATE OR REPLACE FUNCTION invex.trg_orders_check_refs()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.supplier_id IS NOT NULL THEN
        PERFORM invex.prevent_soft_deleted_reference('invex.suppliers', NEW.supplier_id);
    END IF;

    PERFORM invex.prevent_soft_deleted_reference('invex.users', NEW.user_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_refs
BEFORE INSERT OR UPDATE ON invex.orders
FOR EACH ROW EXECUTE FUNCTION invex.trg_orders_check_refs();

-- ORDER ITEMS → product

CREATE OR REPLACE FUNCTION invex.trg_order_items_check_refs()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM invex.prevent_soft_deleted_reference('invex.products', NEW.product_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_items_refs
BEFORE INSERT OR UPDATE ON invex.order_items
FOR EACH ROW EXECUTE FUNCTION invex.trg_order_items_check_refs();

-- ============================================================
-- 5. SAFE DEFAULT VIEWS (USE THESE IN YOUR APP)
-- ============================================================

CREATE OR REPLACE VIEW invex.active_categories AS
SELECT * FROM invex.categories WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW invex.active_suppliers AS
SELECT * FROM invex.suppliers WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW invex.active_locations AS
SELECT * FROM invex.locations WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW invex.active_products AS
SELECT * FROM invex.products WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW invex.active_orders AS
SELECT * FROM invex.orders WHERE is_deleted = FALSE;

-- ============================================================
-- 6. UPDATED STOCK MOVEMENTS VIEW
-- ============================================================

CREATE OR REPLACE VIEW invex.stock_movements AS

SELECT
    oi.id AS movement_id,
    o.order_date AS movement_date,
    CASE o.order_type
        WHEN 'IN' THEN oi.quantity
        WHEN 'OUT' THEN -oi.quantity
        ELSE 0
    END AS quantity_change,
    oi.product_id,
    oi.batch_id,
    COALESCE(o.destination_location_id, o.source_location_id) AS location_id,
    o.user_id,
    NULL::INTEGER AS reason_code_id,
    'ORDER' AS source_type,
    o.id AS source_id,
    o.notes
FROM invex.order_items oi
JOIN invex.orders o ON oi.order_id = o.id
WHERE o.is_deleted = FALSE
  AND (oi.is_deleted = FALSE OR oi.is_deleted IS NULL)

UNION ALL

SELECT
    sa.id,
    sa.adjustment_date,
    CASE sa.adjustment_type
        WHEN 'INCREASE' THEN sa.quantity_change
        WHEN 'DECREASE' THEN -sa.quantity_change
    END,
    sa.product_id,
    sa.batch_id,
    sa.location_id,
    sa.user_id,
    sa.reason_code_id,
    'ADJUSTMENT',
    sa.id,
    sa.notes
FROM invex.stock_adjustments sa
WHERE sa.is_deleted = FALSE;




--new added feature for locations to support multi locations--

-- ============================================================
-- 1. COLUMN ADDITIONS TO EXISTING TABLES
-- ============================================================

-- Add color to locations for UI badge distinction
ALTER TABLE invex.locations
    ADD COLUMN IF NOT EXISTS color VARCHAR(7) NOT NULL DEFAULT '#6c757d';

-- Add location context to activity logs
ALTER TABLE invex.activity_logs
    ADD COLUMN IF NOT EXISTS location_id INTEGER
        REFERENCES invex.locations(id) ON DELETE SET NULL;

-- ============================================================
-- 2. NEW TABLE: location_transfer_logs
--    Records completed stock transfers between locations.
--    No approval workflow — transfers execute immediately.
-- ============================================================

CREATE TABLE invex.location_transfer_logs (
    id                  SERIAL      PRIMARY KEY,
    from_location_id    INTEGER     NOT NULL
                            REFERENCES invex.locations(id) ON DELETE RESTRICT,
    to_location_id      INTEGER     NOT NULL
                            REFERENCES invex.locations(id) ON DELETE RESTRICT,
    product_id          INTEGER     NOT NULL
                            REFERENCES invex.products(id)  ON DELETE RESTRICT,
    batch_id            INTEGER
                            REFERENCES invex.product_batches(id) ON DELETE SET NULL,
    quantity            INTEGER     NOT NULL CHECK (quantity > 0),
    transferred_by      INTEGER     NOT NULL
                            REFERENCES invex.users(id) ON DELETE RESTRICT,
    notes               TEXT,
    is_deleted          BOOLEAN     NOT NULL DEFAULT FALSE,
    deleted_at          TIMESTAMP,
    transferred_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT different_locations CHECK (from_location_id <> to_location_id)
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

-- Transfer log lookups
CREATE INDEX idx_invex_transfer_logs_product
    ON invex.location_transfer_logs(product_id);

CREATE INDEX idx_invex_transfer_logs_from_location
    ON invex.location_transfer_logs(from_location_id);

CREATE INDEX idx_invex_transfer_logs_to_location
    ON invex.location_transfer_logs(to_location_id);

CREATE INDEX idx_invex_transfer_logs_transferred_by
    ON invex.location_transfer_logs(transferred_by);

CREATE INDEX idx_invex_transfer_logs_transferred_at
    ON invex.location_transfer_logs(transferred_at DESC);


-- ============================================================
-- 4. VIEWS
-- ============================================================

-- Location stock summary — powers dashboard location widget
-- Returns pure numbers, rendered as stat cards on the frontend
CREATE VIEW invex.location_stock_summary AS
SELECT
    l.id                                        AS location_id,
    l.name                                      AS location_name,
    l.code                                      AS location_code,
    l.type                                      AS location_type,
    l.color                                     AS location_color,
    COUNT(DISTINCT ps.product_id)               AS total_products,
    COALESCE(SUM(ps.quantity), 0)               AS total_units,
    COUNT(DISTINCT CASE
        WHEN ps.quantity = 0
        THEN ps.product_id
    END)                                        AS out_of_stock_count,
    COUNT(DISTINCT CASE
        WHEN pb.expiry_date <= CURRENT_DATE + INTERVAL '30 days'
         AND pb.expiry_date >= CURRENT_DATE
         AND pb.is_deleted = FALSE
        THEN pb.id
    END)                                        AS expiring_soon_count,
    COUNT(DISTINCT CASE
        WHEN pb.expiry_date < CURRENT_DATE
         AND pb.is_deleted = FALSE
        THEN pb.id
    END)                                        AS expired_count
FROM invex.locations l
LEFT JOIN invex.product_stock ps
    ON ps.location_id = l.id
LEFT JOIN invex.product_batches pb
    ON pb.location_id = l.id
   AND pb.product_id  = ps.product_id
WHERE l.is_deleted = FALSE
GROUP BY l.id, l.name, l.code, l.type, l.color;

-- ============================================================

-- Transfer log view — fully joined for the transfers history page
CREATE VIEW invex.transfer_log_details AS
SELECT
    t.id,
    t.quantity,
    t.notes,
    t.transferred_at,

    -- Product
    p.id                AS product_id,
    p.name              AS product_name,
    p.sku               AS product_sku,
    p.unit_of_measure,

    -- From location
    fl.id               AS from_location_id,
    fl.name             AS from_location_name,
    fl.code             AS from_location_code,
    fl.color            AS from_location_color,

    -- To location
    tl.id               AS to_location_id,
    tl.name             AS to_location_name,
    tl.code             AS to_location_code,
    tl.color            AS to_location_color,

    -- User who performed the transfer
    u.id                AS transferred_by_id,
    u.full_name         AS transferred_by_name,

    -- Batch info (nullable)
    pb.batch_no,
    pb.expiry_date      AS batch_expiry_date,

    -- Stock levels at both locations at time of query
    ps_from.quantity    AS current_stock_at_source,
    ps_to.quantity      AS current_stock_at_destination

FROM invex.location_transfer_logs t
JOIN invex.products p               ON p.id  = t.product_id
JOIN invex.locations fl             ON fl.id = t.from_location_id
JOIN invex.locations tl             ON tl.id = t.to_location_id
JOIN invex.users u                  ON u.id  = t.transferred_by
LEFT JOIN invex.product_batches pb  ON pb.id = t.batch_id
LEFT JOIN invex.product_stock ps_from
    ON ps_from.product_id  = t.product_id
   AND ps_from.location_id = t.from_location_id
LEFT JOIN invex.product_stock ps_to
    ON ps_to.product_id  = t.product_id
   AND ps_to.location_id = t.to_location_id
WHERE t.is_deleted = FALSE;

-- ============================================================

-- Active transfer logs filter wrapper
CREATE VIEW invex.active_transfer_logs AS
SELECT * FROM invex.location_transfer_logs
WHERE is_deleted = FALSE;

-- ============================================================

-- Updated stock_movements — adds transfer legs to existing view
CREATE OR REPLACE VIEW invex.stock_movements AS

-- Existing: orders
SELECT
    oi.id                                                       AS movement_id,
    o.order_date                                                AS movement_date,
    CASE o.order_type
        WHEN 'IN'  THEN  oi.quantity
        WHEN 'OUT' THEN -oi.quantity
        ELSE 0
    END                                                         AS quantity_change,
    oi.product_id,
    oi.batch_id,
    COALESCE(o.destination_location_id,
             o.source_location_id)                              AS location_id,
    o.user_id,
    NULL::INTEGER                                               AS reason_code_id,
    'ORDER'::TEXT                                               AS source_type,
    o.id                                                        AS source_id,
    o.notes
FROM invex.order_items oi
JOIN invex.orders o ON oi.order_id = o.id
WHERE o.is_deleted = FALSE
  AND (oi.is_deleted = FALSE OR oi.is_deleted IS NULL)

UNION ALL

-- Existing: adjustments
SELECT
    sa.id,
    sa.adjustment_date,
    CASE sa.adjustment_type
        WHEN 'INCREASE' THEN  sa.quantity_change
        WHEN 'DECREASE' THEN -sa.quantity_change
    END,
    sa.product_id,
    sa.batch_id,
    sa.location_id,
    sa.user_id,
    sa.reason_code_id,
    'ADJUSTMENT'::TEXT,
    sa.id,
    sa.notes
FROM invex.stock_adjustments sa
WHERE sa.is_deleted = FALSE

UNION ALL

-- New: transfer deduction from source location
SELECT
    t.id                        AS movement_id,
    t.transferred_at            AS movement_date,
    -(t.quantity)               AS quantity_change,
    t.product_id,
    t.batch_id,
    t.from_location_id          AS location_id,
    t.transferred_by            AS user_id,
    NULL::INTEGER               AS reason_code_id,
    'TRANSFER_OUT'::TEXT        AS source_type,
    t.id                        AS source_id,
    t.notes
FROM invex.location_transfer_logs t
WHERE t.is_deleted = FALSE

UNION ALL

-- New: transfer addition to destination location
SELECT
    t.id                        AS movement_id,
    t.transferred_at            AS movement_date,
    t.quantity                  AS quantity_change,
    t.product_id,
    t.batch_id,
    t.to_location_id            AS location_id,
    t.transferred_by            AS user_id,
    NULL::INTEGER               AS reason_code_id,
    'TRANSFER_IN'::TEXT         AS source_type,
    t.id                        AS source_id,
    t.notes
FROM invex.location_transfer_logs t
WHERE t.is_deleted = FALSE;

-- ============================================================
-- 5. FUNCTIONS AND TRIGGERS
-- ============================================================

-- Soft delete sync for location_transfer_logs
-- Reuses existing invex.set_deleted_at() function
CREATE TRIGGER trg_transfer_logs_soft_delete
BEFORE UPDATE ON invex.location_transfer_logs
FOR EACH ROW EXECUTE FUNCTION invex.set_deleted_at();

-- ============================================================

-- Auto-seed product_stock rows when a new location is created
CREATE OR REPLACE FUNCTION invex.seed_stock_for_new_location()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO invex.product_stock (product_id, location_id, quantity)
    SELECT id, NEW.id, 0
    FROM invex.products
    WHERE is_deleted = FALSE
    ON CONFLICT (product_id, location_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_seed_stock_on_location_insert
AFTER INSERT ON invex.locations
FOR EACH ROW
EXECUTE FUNCTION invex.seed_stock_for_new_location();

-- ============================================================

-- Auto-seed product_stock rows when a new product is created
CREATE OR REPLACE FUNCTION invex.seed_stock_for_new_product()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO invex.product_stock (product_id, location_id, quantity)
    SELECT NEW.id, id, 0
    FROM invex.locations
    WHERE is_deleted = FALSE
    ON CONFLICT (product_id, location_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_seed_stock_on_product_insert
AFTER INSERT ON invex.products
FOR EACH ROW
EXECUTE FUNCTION invex.seed_stock_for_new_product();

-- ============================================================
-- 6. NEW REASON CODES
-- ============================================================

INSERT INTO invex.reason_codes (code, description, adjustment_type) VALUES
    ('TRANSFER_OUT',  'Stock deducted due to outbound location transfer',  'DECREASE'),
    ('TRANSFER_IN',   'Stock added due to inbound location transfer',      'INCREASE'),
    ('GLOBAL_ADJUST', 'Stock updated globally across all locations',       'BOTH')
ON CONFLICT (code) DO NOTHING;
