const { query } = require('../src/config/db');

/**
 * List transfers from the transfer_log_details view, with optional filters.
 */
const listTransfers = async ({ product_id, from_location_id, to_location_id, transferred_by, date_from, date_to } = {}) => {
  let sql = `SELECT * FROM invex.transfer_log_details WHERE 1 = 1`;
  const values = [];
  let idx = 1;

  if (product_id) {
    sql += ` AND product_id = $${idx++}`;
    values.push(product_id);
  }
  if (from_location_id) {
    sql += ` AND from_location_id = $${idx++}`;
    values.push(from_location_id);
  }
  if (to_location_id) {
    sql += ` AND to_location_id = $${idx++}`;
    values.push(to_location_id);
  }
  if (transferred_by) {
    sql += ` AND transferred_by_id = $${idx++}`;
    values.push(transferred_by);
  }
  if (date_from) {
    sql += ` AND transferred_at >= $${idx++}`;
    values.push(date_from);
  }
  if (date_to) {
    sql += ` AND transferred_at <= $${idx++}`;
    values.push(date_to);
  }

  sql += ' ORDER BY transferred_at DESC';

  const result = await query(sql, values);
  return result.rows;
};

/**
 * Fetch a single transfer log row by ID.
 */
const getTransferById = async (id) => {
  const result = await query(
    `SELECT * FROM invex.transfer_log_details WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Lock and read a product's stock row at a location. Used during transfer
 * validation to prevent concurrent stock races.
 */
const lockSourceStock = async (client, product_id, location_id) => {
  const result = await client.query(
    `SELECT quantity
     FROM invex.product_stock
     WHERE product_id = $1 AND location_id = $2
     FOR UPDATE`,
    [product_id, location_id]
  );
  return result.rows[0] || null;
};

/**
 * Lock and read a single batch row at the source location during a transfer.
 */
const lockSourceBatch = async (client, batch_id, product_id, location_id) => {
  const result = await client.query(
    `SELECT id, product_id, batch_no, quantity, expiry_date
     FROM invex.product_batches
     WHERE id = $1
       AND product_id = $2
       AND location_id = $3
       AND is_deleted = FALSE
     FOR UPDATE`,
    [batch_id, product_id, location_id]
  );
  return result.rows[0] || null;
};

/**
 * Decrease a batch's quantity at the source location (after a transfer).
 */
const decrementBatchAtLocation = async (client, batch_id, location_id, quantity) => {
  await client.query(
    `UPDATE invex.product_batches
     SET quantity = quantity - $2
     WHERE id = $1 AND location_id = $3`,
    [batch_id, quantity, location_id]
  );
};

/**
 * Find a matching destination batch (same batch_no + expiry) so we can
 * merge transferred quantity into it instead of creating a duplicate.
 */
const findDestinationBatch = async (client, product_id, location_id, batch_no, expiry_date) => {
  const result = await client.query(
    `SELECT id
     FROM invex.product_batches
     WHERE product_id = $1
       AND location_id = $2
       AND batch_no = $3
       AND expiry_date = $4
       AND is_deleted = FALSE
     LIMIT 1`,
    [product_id, location_id, batch_no, expiry_date]
  );
  return result.rows[0] || null;
};

/**
 * Add quantity to an existing batch by id.
 */
const incrementBatch = async (client, batch_id, quantity) => {
  await client.query(
    `UPDATE invex.product_batches
     SET quantity = quantity + $2
     WHERE id = $1`,
    [batch_id, quantity]
  );
};

/**
 * Create a fresh batch row at the destination location.
 */
const createBatchAtLocation = async (client, { product_id, location_id, batch_no, quantity, expiry_date }) => {
  await client.query(
    `INSERT INTO invex.product_batches (product_id, location_id, batch_no, quantity, expiry_date)
     VALUES ($1, $2, $3, $4, $5)`,
    [product_id, location_id, batch_no, quantity, expiry_date]
  );
};

/**
 * Insert a location_transfer_logs row. Returns the inserted record.
 */
const insertTransferLog = async (client, { from_location_id, to_location_id, product_id, batch_id, quantity, transferred_by, notes }) => {
  const result = await client.query(
    `INSERT INTO invex.location_transfer_logs
       (from_location_id, to_location_id, product_id, batch_id, quantity, transferred_by, notes, transferred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING id, from_location_id, to_location_id, product_id, batch_id, quantity, transferred_by, notes, transferred_at`,
    [
      from_location_id,
      to_location_id,
      product_id,
      batch_id || null,
      quantity,
      transferred_by,
      notes || null,
    ]
  );
  return result.rows[0];
};

/**
 * Soft-delete a transfer log row.
 */
const softDeleteTransfer = async (id) => {
  const result = await query(
    `UPDATE invex.location_transfer_logs
     SET is_deleted = TRUE
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id, from_location_id, to_location_id, product_id, quantity`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  listTransfers,
  getTransferById,
  lockSourceStock,
  lockSourceBatch,
  decrementBatchAtLocation,
  findDestinationBatch,
  incrementBatch,
  createBatchAtLocation,
  insertTransferLog,
  softDeleteTransfer,
};
