-- 004b: brings a database built from database.sql + 001-004 in line with the working database.
-- Adds transfer adjustments (to_location_id, TRANSFER in two CHECKs), four missing indexes and three reason codes.
-- Safe to run twice.

ALTER TABLE invex.stock_adjustments
    ADD COLUMN IF NOT EXISTS to_location_id INTEGER REFERENCES invex.locations(id);

ALTER TABLE invex.stock_adjustments
    DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;
ALTER TABLE invex.stock_adjustments
    ADD CONSTRAINT stock_adjustments_adjustment_type_check
    CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'TRANSFER'));

ALTER TABLE invex.reason_codes
    DROP CONSTRAINT IF EXISTS reason_codes_adjustment_type_check;
ALTER TABLE invex.reason_codes
    ADD CONSTRAINT reason_codes_adjustment_type_check
    CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'BOTH', 'TRANSFER'));

CREATE INDEX IF NOT EXISTS idx_batches_expiry
    ON invex.product_batches (expiry_date) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_invex_batches_location
    ON invex.product_batches (location_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_invex_product_stock_location
    ON invex.product_stock (location_id);
CREATE INDEX IF NOT EXISTS idx_invex_activity_location
    ON invex.activity_logs (location_id, created_at DESC);

-- Reason codes the working database has but a fresh build lacked.
INSERT INTO invex.reason_codes (code, description, adjustment_type) VALUES
    ('RECEIVE',     'Stock received into a location',            'INCREASE'),
    ('TRANSFER',    'Internal stock transfer between locations', 'TRANSFER'),
    ('MANUAL_EDIT', 'Stock total edited from the Products page', 'BOTH')
ON CONFLICT (code) DO NOTHING;
