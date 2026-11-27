-- ============================================================
-- Migration 005: Audit Logs Table and Triggers
-- Owner: Leo & Aaron | Used by: Lev (Audit Logs UI)
-- ============================================================

CREATE TABLE IF NOT EXISTS invex.audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    table_name  VARCHAR(50) NOT NULL,
    record_id   INTEGER,
    action      VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data    JSONB,
    new_data    JSONB,
    changed_by  INTEGER REFERENCES invex.users(id),
    changed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_record 
    ON invex.audit_logs (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at 
    ON invex.audit_logs (changed_at DESC);

-- Generic Audit Trigger Function (excludes password hashes)
CREATE OR REPLACE FUNCTION invex.fn_audit_row()
RETURNS TRIGGER AS $$
DECLARE
    v_user INTEGER := NULLIF(current_setting('app.user_id', true), '')::INTEGER;
    v_old JSONB;
    v_new JSONB;
BEGIN
    IF TG_OP <> 'INSERT' THEN 
        v_old := to_jsonb(OLD) - 'password'; 
    END IF;

    IF TG_OP <> 'DELETE' THEN 
        v_new := to_jsonb(NEW) - 'password'; 
    END IF;

    INSERT INTO invex.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (
        TG_TABLE_NAME,
        COALESCE((v_new ->> 'id')::INTEGER, (v_old ->> 'id')::INTEGER),
        TG_OP, 
        v_old, 
        v_new, 
        v_user
    );

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply Audit Triggers to Core Tables
DROP TRIGGER IF EXISTS trg_audit_products ON invex.products;
CREATE TRIGGER trg_audit_products
AFTER INSERT OR UPDATE OR DELETE ON invex.products
FOR EACH ROW EXECUTE FUNCTION invex.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_product_stock ON invex.product_stock;
CREATE TRIGGER trg_audit_product_stock
AFTER INSERT OR UPDATE OR DELETE ON invex.product_stock
FOR EACH ROW EXECUTE FUNCTION invex.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_orders ON invex.orders;
CREATE TRIGGER trg_audit_orders
AFTER INSERT OR UPDATE OR DELETE ON invex.orders
FOR EACH ROW EXECUTE FUNCTION invex.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_stock_adjustments ON invex.stock_adjustments;
CREATE TRIGGER trg_audit_stock_adjustments
AFTER INSERT OR UPDATE OR DELETE ON invex.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION invex.fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_users ON invex.users;
CREATE TRIGGER trg_audit_users
AFTER INSERT OR UPDATE OR DELETE ON invex.users
FOR EACH ROW EXECUTE FUNCTION invex.fn_audit_row();
