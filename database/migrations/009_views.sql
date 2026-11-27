-- ============================================================
-- Migration 009: Invex Analytical Views
-- Owner: Leo | Contract for: Aaron (API) & Lev (Audit & Reports UI)
-- ============================================================

-- 1. Audit Trail View (Audit logs left-joined with users to get changed_by_name)
CREATE OR REPLACE VIEW invex.vw_audit_trail AS
SELECT 
    al.id,
    al.changed_at,
    al.table_name,
    al.record_id,
    al.action,
    al.changed_by,
    COALESCE(u.full_name, u.username, 'System') AS changed_by_name,
    al.old_data,
    al.new_data
FROM invex.audit_logs al
LEFT JOIN invex.users u ON al.changed_by = u.id;

-- 2. Low Stock View (Current stock <= reorder_level across locations)
CREATE OR REPLACE VIEW invex.vw_low_stock AS
SELECT 
    p.id AS product_id,
    p.sku,
    p.name AS product_name,
    l.id AS location_id,
    l.name AS location_name,
    COALESCE(ps.quantity, 0) AS current_stock,
    p.reorder_level
FROM invex.products p
CROSS JOIN invex.locations l
LEFT JOIN invex.product_stock ps 
    ON ps.product_id = p.id AND ps.location_id = l.id
WHERE p.is_deleted = FALSE 
  AND l.is_deleted = FALSE
  AND COALESCE(ps.quantity, 0) <= p.reorder_level;

-- 3. Expiring Batches View (Batches expiring within 30 days)
CREATE OR REPLACE VIEW invex.vw_expiring_batches AS
SELECT 
    pb.batch_no,
    p.sku,
    p.name AS product_name,
    l.id AS location_id,
    l.name AS location_name,
    pb.quantity,
    pb.expiry_date,
    CURRENT_DATE AS today,
    (pb.expiry_date - CURRENT_DATE) AS days_until_expiry
FROM invex.product_batches pb
JOIN invex.products p ON pb.product_id = p.id
JOIN invex.locations l ON pb.location_id = l.id
WHERE pb.is_deleted = FALSE 
  AND p.is_deleted = FALSE
  AND pb.quantity > 0
  AND pb.expiry_date <= CURRENT_DATE + INTERVAL '30 days';
