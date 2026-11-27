const transferModel = require('../models/transferModel');
const activityLogModel = require('../models/activityLogModel');
const stockModel = require('../src/models/stockModel');
const { logActivity } = require('../src/utils/logger');
const { withTransaction, HttpError } = require('../src/utils/transaction');
const notificationService = require('../services/notificationService');
const { scopeLocation } = require('../src/utils/locationScope');

/**
 * GET /api/transfers
 */
exports.getAllTransfers = async (req, res, next) => {
  try {
    const { product_id, from_location_id, to_location_id, transferred_by, date_from, date_to } = req.query;
    // For sub_admin/staff, force at least one of the location filters to
    // their own location so they can't list cross-location transfers.
    if (req.user.role !== 'super_admin') {
      const ownLoc = req.user.location_id;
      if (ownLoc == null) {
        return res.status(403).json({ success: false, code: 'NO_LOCATION_ASSIGNMENT', message: 'Your account has no location assigned yet.' });
      }
      const fromInt = from_location_id != null ? parseInt(from_location_id, 10) : null;
      const toInt = to_location_id != null ? parseInt(to_location_id, 10) : null;
      if ((fromInt != null && fromInt !== ownLoc) || (toInt != null && toInt !== ownLoc)) {
        return res.status(403).json({ success: false, code: 'LOCATION_FORBIDDEN', message: 'You can only view transfers for your assigned location.' });
      }
      // Fall back to listing transfers where ownLoc is either side.
      if (fromInt == null && toInt == null) {
        const both = await transferModel.listTransfers({ product_id, from_location_id: ownLoc, transferred_by, date_from, date_to });
        const dest = await transferModel.listTransfers({ product_id, to_location_id: ownLoc, transferred_by, date_from, date_to });
        const merged = [...both, ...dest].reduce((acc, row) => {
          if (!acc.has(row.id)) acc.set(row.id, row);
          return acc;
        }, new Map());
        const rows = Array.from(merged.values()).sort((a, b) => new Date(b.transferred_at) - new Date(a.transferred_at));
        return res.json({ success: true, count: rows.length, data: rows });
      }
    }
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

    // Sub-admins can only initiate a transfer that involves their location
    // on one of the two sides.
    if (req.user.role !== 'super_admin') {
      const ownLoc = req.user.location_id;
      if (ownLoc == null) {
        return res.status(403).json({ success: false, code: 'NO_LOCATION_ASSIGNMENT', message: 'Your account has no location assigned yet.' });
      }
      const fromInt = parseInt(from_location_id, 10);
      const toInt = parseInt(to_location_id, 10);
      if (fromInt !== ownLoc && toInt !== ownLoc) {
        return res.status(403).json({
          success: false,
          code: 'LOCATION_FORBIDDEN',
          message: 'You can only create transfers that involve your assigned location.',
        });
      }
    }

    const transfer = await withTransaction(async (client) => {
      const sourceLocationSku = await stockModel.ensureLocationSku(product_id, from_location_id, client);
      const destinationLocationSku = await stockModel.ensureLocationSku(product_id, to_location_id, client);

      const sourceStock = await transferModel.lockSourceStock(client, product_id, from_location_id);
      if (!sourceStock || sourceStock.quantity < transferQuantity) {
        throw new HttpError(400, 'Insufficient stock at source location');
      }

      await stockModel.applyMovement(client, 'TRANSFER', {
        productId: product_id,
        from: from_location_id,
        to: to_location_id,
        qty: transferQuantity,
      });

      if (batch_id) {
        const sourceBatch = await transferModel.lockSourceBatch(client, batch_id, product_id, from_location_id);
        if (!sourceBatch) {
          throw new HttpError(404, 'Batch not found.');
        }

        if (sourceBatch.quantity < transferQuantity) {
          throw new HttpError(400, 'Insufficient stock at source location');
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

      const created = await transferModel.insertTransferLog(client, {
        from_location_id,
        to_location_id,
        product_id,
        batch_id,
        quantity: transferQuantity,
        transferred_by: req.user.id,
        notes,
      });

      created.source_location_sku = sourceLocationSku;
      created.destination_location_sku = destinationLocationSku;
      const activityDetails = `Transferred ${created.quantity} units of product ${created.product_id} from location ${created.from_location_id} to location ${created.to_location_id}.`;

      await activityLogModel.insertLog(client, {
        user_id: req.user.id,
        action: 'TRANSFER',
        entity_type: 'location_transfer_logs',
        entity_id: created.id,
        location_id: from_location_id,
        details: activityDetails,
      });

      return created;
    });

    // Trigger notification scan
    notificationService.requestScan();

    return res.status(201).json({ success: true, data: transfer });
  } catch (error) {
    return next(error);
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
