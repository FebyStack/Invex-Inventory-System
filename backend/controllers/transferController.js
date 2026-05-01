const { pool, query } = require('../src/config/db');
const { logActivity } = require('../src/utils/logger');

/**
 * GET /api/transfers
 */
exports.getAllTransfers = async (req, res, next) => {
  try {
    const { product_id, from_location_id, to_location_id, transferred_by, date_from, date_to } = req.query;
    let sql = `
      SELECT *
      FROM invex.transfer_log_details
      WHERE 1 = 1
    `;
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
    return res.json({ success: true, count: result.rowCount, data: result.rows });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/transfers/:id
 */
exports.getTransferById = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT *
       FROM invex.transfer_log_details
       WHERE id = $1`,
      [req.params.id]
    );

    const transfer = result.rows[0];
    if (!transfer) {
      return res.status(404).json({ success: false, message: 'Transfer not found.' });
    }

    return res.json({ success: true, data: transfer });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/transfers
 * Executes a location-to-location stock transfer immediately.
 */
exports.createTransfer = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { from_location_id, to_location_id, product_id, batch_id, quantity, notes } = req.body;
    const transferQuantity = Number(quantity);

    if (!from_location_id || !to_location_id || !product_id || quantity === undefined || quantity === null) {
      return res.status(400).json({
        success: false,
        message: 'from_location_id, to_location_id, product_id, and quantity are required.',
      });
    }

    if (String(from_location_id) === String(to_location_id)) {
      return res.status(400).json({
        success: false,
        message: 'from_location_id and to_location_id must not be equal.',
      });
    }

    if (Number.isNaN(transferQuantity) || transferQuantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'quantity must be greater than 0.',
      });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const sourceStockResult = await client.query(
      `SELECT quantity
       FROM invex.product_stock
       WHERE product_id = $1 AND location_id = $2
       FOR UPDATE`,
      [product_id, from_location_id]
    );

    const sourceStock = sourceStockResult.rows[0];
    if (!sourceStock || sourceStock.quantity < transferQuantity) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ success: false, message: 'Insufficient stock at source location' });
    }

    await client.query(
      `UPDATE invex.product_stock
       SET quantity = quantity - $3,
           last_updated = NOW()
       WHERE product_id = $1 AND location_id = $2`,
      [product_id, from_location_id, transferQuantity]
    );

    const destinationStockResult = await client.query(
      `UPDATE invex.product_stock
       SET quantity = quantity + $3,
           last_updated = NOW()
       WHERE product_id = $1 AND location_id = $2`,
      [product_id, to_location_id, transferQuantity]
    );

    if (destinationStockResult.rowCount === 0) {
      throw new Error('Destination stock record not found for this product and location.');
    }

    if (batch_id) {
      const sourceBatchResult = await client.query(
        `SELECT id, product_id, batch_no, quantity, expiry_date
         FROM invex.product_batches
         WHERE id = $1
           AND product_id = $2
           AND location_id = $3
           AND is_deleted = FALSE
         FOR UPDATE`,
        [batch_id, product_id, from_location_id]
      );

      const sourceBatch = sourceBatchResult.rows[0];
      if (!sourceBatch) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(404).json({ success: false, message: 'Batch not found.' });
      }

      if (sourceBatch.quantity < transferQuantity) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(400).json({ success: false, message: 'Insufficient stock at source location' });
      }

      await client.query(
        `UPDATE invex.product_batches
         SET quantity = quantity - $2
         WHERE id = $1 AND location_id = $3`,
        [batch_id, transferQuantity, from_location_id]
      );

      const destinationBatchResult = await client.query(
        `SELECT id
         FROM invex.product_batches
         WHERE product_id = $1
           AND location_id = $2
           AND batch_no = $3
           AND expiry_date = $4
           AND is_deleted = FALSE
         LIMIT 1`,
        [sourceBatch.product_id, to_location_id, sourceBatch.batch_no, sourceBatch.expiry_date]
      );

      const destinationBatch = destinationBatchResult.rows[0];
      if (destinationBatch) {
        await client.query(
          `UPDATE invex.product_batches
           SET quantity = quantity + $2
           WHERE id = $1`,
          [destinationBatch.id, transferQuantity]
        );
      } else {
        await client.query(
          `INSERT INTO invex.product_batches (product_id, location_id, batch_no, quantity, expiry_date)
           VALUES ($1, $2, $3, $4, $5)`,
          [sourceBatch.product_id, to_location_id, sourceBatch.batch_no, transferQuantity, sourceBatch.expiry_date]
        );
      }
    }

    const transferResult = await client.query(
      `INSERT INTO invex.location_transfer_logs
         (from_location_id, to_location_id, product_id, batch_id, quantity, transferred_by, notes, transferred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, from_location_id, to_location_id, product_id, batch_id, quantity, transferred_by, notes, transferred_at`,
      [
        from_location_id,
        to_location_id,
        product_id,
        batch_id || null,
        transferQuantity,
        req.user.id,
        notes || null,
      ]
    );

    const transfer = transferResult.rows[0];
    const activityDetails = `Transferred ${transfer.quantity} units of product ${transfer.product_id} from location ${transfer.from_location_id} to location ${transfer.to_location_id}.`;

    await client.query(
      `INSERT INTO invex.activity_logs
         (user_id, action, entity_type, entity_id, location_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, 'TRANSFER', 'location_transfer_logs', transfer.id, from_location_id, activityDetails]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    return res.status(201).json({ success: true, data: transfer });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    return next(error);
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/transfers/:id
 * Soft-deletes the transfer log only. Stock is not reversed.
 */
exports.deleteTransfer = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE invex.location_transfer_logs
       SET is_deleted = TRUE
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id, from_location_id, to_location_id, product_id, quantity`,
      [req.params.id]
    );

    const deleted = result.rows[0];
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Transfer not found.' });
    }

    void logActivity(req.user.id, 'DELETE_TRANSFER', 'location_transfer_logs', deleted.id, {
      product_id: deleted.product_id,
      quantity: deleted.quantity,
      message: 'Transfer log soft-deleted.',
    }, deleted.from_location_id);

    return res.json({ success: true, message: 'Transfer deleted successfully.' });
  } catch (error) {
    return next(error);
  }
};
