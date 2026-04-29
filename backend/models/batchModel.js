const { query } = require('../src/config/db');

/**
 * Get all active product batches.
 */
const getAllBatches = async () => {
  const result = await query(
    `SELECT pb.id, pb.product_id, pb.location_id, pb.batch_no, pb.quantity, 
            pb.expiry_date, pb.received_date, pb.created_at,
            p.name AS product_name, p.sku, l.name AS location_name
     FROM invex.product_batches pb
     JOIN invex.products p ON pb.product_id = p.id
     JOIN invex.locations l ON pb.location_id = l.id
     WHERE pb.is_deleted = FALSE
     ORDER BY pb.created_at DESC`
  );
  return result.rows;
};

/**
 * Get a single active batch by ID.
 */
const getBatchById = async (id) => {
  const result = await query(
    `SELECT pb.id, pb.product_id, pb.location_id, pb.batch_no, pb.quantity, 
            pb.expiry_date, pb.received_date, pb.created_at,
            p.name AS product_name, p.sku, l.name AS location_name
     FROM invex.product_batches pb
     JOIN invex.products p ON pb.product_id = p.id
     JOIN invex.locations l ON pb.location_id = l.id
     WHERE pb.id = $1 AND pb.is_deleted = FALSE`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Create a new product batch manually.
 */
const createBatch = async ({ product_id, location_id, batch_no, quantity, expiry_date }) => {
  const result = await query(
    `INSERT INTO invex.product_batches (product_id, location_id, batch_no, quantity, expiry_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, product_id, location_id, batch_no, quantity, expiry_date, received_date, created_at`,
    [product_id, location_id, batch_no, quantity, expiry_date]
  );
  return result.rows[0];
};

/**
 * Update an existing active batch.
 */
const updateBatch = async (id, { batch_no, quantity, expiry_date }) => {
  const fields = [];
  const values = [];
  let idx = 1;

  const columns = { batch_no, quantity, expiry_date };

  for (const [col, val] of Object.entries(columns)) {
    if (val !== undefined) {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    }
  }

  if (fields.length === 0) return null;
  values.push(id);

  const result = await query(
    `UPDATE invex.product_batches SET ${fields.join(', ')}
     WHERE id = $${idx} AND is_deleted = FALSE
     RETURNING id, product_id, location_id, batch_no, quantity, expiry_date, received_date, created_at`,
    values
  );
  return result.rows[0] || null;
};

/**
 * Soft-delete a batch.
 */
const softDeleteBatch = async (id) => {
  const result = await query(
    `UPDATE invex.product_batches SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Get batches expiring within a specified number of days.
 */
const getExpiringBatches = async (days) => {
  const result = await query(
    `SELECT pb.id, pb.product_id, pb.location_id, pb.batch_no, pb.quantity, 
            pb.expiry_date, pb.received_date, pb.created_at,
            p.name AS product_name, p.sku, l.name AS location_name
     FROM invex.product_batches pb
     JOIN invex.products p ON pb.product_id = p.id
     JOIN invex.locations l ON pb.location_id = l.id
     WHERE pb.is_deleted = FALSE 
       AND pb.quantity > 0
       AND pb.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int
     ORDER BY pb.expiry_date ASC`,
    [days]
  );
  return result.rows;
};

module.exports = {
  getAllBatches,
  getBatchById,
  createBatch,
  updateBatch,
  softDeleteBatch,
  getExpiringBatches
};
