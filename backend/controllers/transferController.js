const { pool } = require('../src/config/db');
const transferModel = require('../models/transferModel');
const activityLogModel = require('../models/activityLogModel');
const stockModel = require('../src/models/stockModel');
const { logActivity } = require('../src/utils/logger');
const notificationService = require('../services/notificationService');

/**
 * GET /api/transfers
 */
exports.getAllTransfers = async (req, res, next) => {
  try {
    const { product_id, from_location_id, to_location_id, transferred_by, date_from, date_to } = req.query;
    const rows = await transferModel.listTransfers({
      product_id,
      from_location_id,
      to_location_id,
      transferred_by,
      date_from,
      date_to,
    });
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/transfers/:id
 */
exports.getTransferById = async (req, res, next) => {
  try {
    const transfer = await transferModel.getTransferById(req.params.id);
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

    const sourceLocationSku = await stockModel.ensureLocationSku(product_id, from_location_id, client);
    const destinationLocationSku = await stockModel.ensureLocationSku(product_id, to_location_id, client);

    const sourceStock = await transferModel.lockSourceStock(client, product_id, from_location_id);
    if (!sourceStock || sourceStock.quantity < transferQuantity) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ success: false, message: 'Insufficient stock at source location' });
    }

    await stockModel.decrementStock(product_id, from_location_id, transferQuantity, client);
    await stockModel.incrementStock(product_id, to_location_id, transferQuantity, client);

    if (batch_id) {
      const sourceBatch = await transferModel.lockSourceBatch(client, batch_id, product_id, from_location_id);
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

      await transferModel.decrementBatchAtLocation(client, batch_id, from_location_id, transferQuantity);

      const destinationBatch = await transferModel.findDestinationBatch(
        client,
        sourceBatch.product_id,
        to_location_id,
        sourceBatch.batch_no,
        sourceBatch.expiry_date
      );
      if (destinationBatch) {
        await transferModel.incrementBatch(client, destinationBatch.id, transferQuantity);
      } else {
        await transferModel.createBatchAtLocation(client, {
          product_id: sourceBatch.product_id,
          location_id: to_location_id,
          batch_no: sourceBatch.batch_no,
          quantity: transferQuantity,
          expiry_date: sourceBatch.expiry_date,
        });
      }
    }

    const transfer = await transferModel.insertTransferLog(client, {
      from_location_id,
      to_location_id,
      product_id,
      batch_id,
      quantity: transferQuantity,
      transferred_by: req.user.id,
      notes,
    });

    transfer.source_location_sku = sourceLocationSku;
    transfer.destination_location_sku = destinationLocationSku;
    const activityDetails = `Transferred ${transfer.quantity} units of product ${transfer.product_id} from location ${transfer.from_location_id} to location ${transfer.to_location_id}.`;

    await activityLogModel.insertLog(client, {
      user_id: req.user.id,
      action: 'TRANSFER',
      entity_type: 'location_transfer_logs',
      entity_id: transfer.id,
      location_id: from_location_id,
      details: activityDetails,
    });

    await client.query('COMMIT');
    transactionStarted = false;

    // Trigger notification scan
    void notificationService.runScan({ silent: true });

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
    const deleted = await transferModel.softDeleteTransfer(req.params.id);
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
