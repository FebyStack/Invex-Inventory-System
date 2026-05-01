const { query } = require('../src/config/db');

/**
 * Create a stock adjustment record.
 * @param {Object} client - DB transaction client
 */
const createAdjustment = async (client, { product_id, location_id, batch_id, adjustment_type, quantity_change, reason_code_id, notes, user_id }) => {
  const result = await client.query(
    `INSERT INTO invex.stock_adjustments
       (product_id, location_id, batch_id, adjustment_type, quantity_change, reason_code_id, notes, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, product_id, location_id, batch_id, adjustment_type, quantity_change, reason_code_id, notes, user_id, adjustment_date`,
    [product_id, location_id, batch_id || null, adjustment_type, quantity_change, reason_code_id, notes || null, user_id]
  );
  return result.rows[0];
};

/**
 * Get all adjustments with optional filters.
 */
const getAllAdjustments = async ({ product_id, location_id, adjustment_type } = {}) => {
  let sql = `
    SELECT sa.id, sa.adjustment_type, sa.quantity_change, sa.notes, sa.adjustment_date,
           p.name AS product_name, p.sku,
           l.name AS location_name, l.code AS location_code,
           rc.code AS reason_code, rc.description AS reason_description,
           u.full_name AS adjusted_by
    FROM invex.stock_adjustments sa
    JOIN invex.products p ON sa.product_id = p.id
    JOIN invex.locations l ON sa.location_id = l.id
    JOIN invex.reason_codes rc ON sa.reason_code_id = rc.id
    JOIN invex.users u ON sa.user_id = u.id
    WHERE sa.is_deleted = FALSE
  `;
  const values = [];
  let idx = 1;

  if (product_id) {
    sql += ` AND sa.product_id = $${idx++}`;
    values.push(product_id);
  }
  if (location_id) {
    sql += ` AND sa.location_id = $${idx++}`;
    values.push(location_id);
  }
  if (adjustment_type) {
    sql += ` AND sa.adjustment_type = $${idx++}`;
    values.push(adjustment_type);
  }

  sql += ` ORDER BY sa.adjustment_date DESC`;

  const result = await query(sql, values);
  return result.rows;
};

/**
 * Get a single adjustment by ID.
 */
const getAdjustmentById = async (id) => {
  const result = await query(
    `SELECT sa.*, p.name AS product_name, p.sku,
            l.name AS location_name, l.code AS location_code,
            rc.code AS reason_code, rc.description AS reason_description,
            u.full_name AS adjusted_by
     FROM invex.stock_adjustments sa
     JOIN invex.products p ON sa.product_id = p.id
     JOIN invex.locations l ON sa.location_id = l.id
     JOIN invex.reason_codes rc ON sa.reason_code_id = rc.id
     JOIN invex.users u ON sa.user_id = u.id
     WHERE sa.id = $1 AND sa.is_deleted = FALSE`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Soft-delete an adjustment and reverse its stock effect.
 */
const softDeleteAdjustment = async (id, client) => {
  const result = await client.query(
    `UPDATE invex.stock_adjustments SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id, product_id, location_id, adjustment_type, quantity_change`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Get product movement history from the stock_movements view.
 */
const getProductHistory = async (productId, locationId) => {
  let sql =
    `SELECT sm.movement_id, sm.movement_date, sm.quantity_change,
            sm.source_type, sm.source_id, sm.notes,
            l.name AS location_name, l.code AS location_code,
            u.full_name AS performed_by,
            rc.code AS reason_code, rc.description AS reason_description,
            pb.batch_no, pb.expiry_date
     FROM invex.stock_movements sm
     LEFT JOIN invex.locations l ON sm.location_id = l.id
     LEFT JOIN invex.users u ON sm.user_id = u.id
     LEFT JOIN invex.reason_codes rc ON sm.reason_code_id = rc.id
     LEFT JOIN invex.product_batches pb ON sm.batch_id = pb.id
     WHERE sm.product_id = $1`;
  const values = [productId];

  if (locationId) {
    sql += ' AND sm.location_id = $2';
    values.push(locationId);
  }

  sql += ' ORDER BY sm.movement_date DESC';

  const result = await query(sql, values);
  return result.rows;
};

module.exports = {
  createAdjustment,
  getAllAdjustments,
  getAdjustmentById,
  softDeleteAdjustment,
  getProductHistory,
};
