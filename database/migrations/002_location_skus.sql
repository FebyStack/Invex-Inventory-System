ALTER TABLE invex.product_stock
    ADD COLUMN IF NOT EXISTS location_sku VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invex_product_stock_location_sku
    ON invex.product_stock(location_sku)
    WHERE location_sku IS NOT NULL;

DROP VIEW IF EXISTS invex.transfer_log_details;

CREATE VIEW invex.transfer_log_details AS
SELECT
    t.id,
    t.quantity,
    t.notes,
    t.transferred_at,

    p.id                AS product_id,
    p.name              AS product_name,
    p.sku               AS product_sku,

    COALESCE(ps_from.location_sku, p.sku)
                        AS source_location_sku,

    COALESCE(ps_to.location_sku, p.sku)
                        AS destination_location_sku,

    p.unit_of_measure,

    fl.id               AS from_location_id,
    fl.name             AS from_location_name,
    fl.code             AS from_location_code,
    fl.color            AS from_location_color,

    tl.id               AS to_location_id,
    tl.name             AS to_location_name,
    tl.code             AS to_location_code,
    tl.color            AS to_location_color,

    u.id                AS transferred_by_id,
    u.full_name         AS transferred_by_name,

    pb.batch_no,
    pb.expiry_date      AS batch_expiry_date,

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

DO $$
DECLARE
    loc RECORD;
    stock RECORD;
    prefix TEXT;
    max_no INTEGER;
    suffix TEXT;
    next_sku TEXT;
BEGIN
    FOR loc IN
        SELECT id, code
        FROM invex.locations
        WHERE is_deleted = FALSE
        ORDER BY id
    LOOP
        prefix := loc.code || '-';

        SELECT COALESCE(MAX(suffix_text::INTEGER), 0)
        INTO max_no
        FROM (
            SELECT substring(sku FROM length(prefix) + 1) AS suffix_text
            FROM invex.products
            WHERE sku LIKE prefix || '%'

            UNION ALL

            SELECT substring(location_sku FROM length(prefix) + 1) AS suffix_text
            FROM invex.product_stock
            WHERE location_sku LIKE prefix || '%'
        ) existing
        WHERE suffix_text ~ '^[0-9]+$';

        FOR stock IN
            SELECT ps.id, ps.product_id, p.sku
            FROM invex.product_stock ps
            JOIN invex.products p
                ON p.id = ps.product_id
               AND p.is_deleted = FALSE
            WHERE ps.location_id = loc.id
              AND ps.quantity > 0
              AND ps.location_sku IS NULL
            ORDER BY ps.id
        LOOP
            suffix := substring(stock.sku FROM length(prefix) + 1);

            IF stock.sku LIKE prefix || '%'
               AND suffix ~ '^[0-9]+$'
               AND NOT EXISTS (
                   SELECT 1
                   FROM invex.product_stock ps2
                   WHERE ps2.location_sku = stock.sku
                     AND ps2.id <> stock.id
               )
            THEN
                next_sku := stock.sku;
            ELSE
                max_no := max_no + 1;
                next_sku := prefix || lpad(max_no::TEXT, 3, '0');
            END IF;

            UPDATE invex.product_stock
            SET location_sku = next_sku,
                last_updated = CURRENT_TIMESTAMP
            WHERE id = stock.id;
        END LOOP;
    END LOOP;
END $$;