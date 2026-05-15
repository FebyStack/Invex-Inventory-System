const productModel = require('../models/productModel');
const stockModel = require('../src/models/stockModel');
const adjustmentModel = require('../models/adjustmentModel');
const reasonCodeModel = require('../models/reasonCodeModel');
const { pool } = require('../src/config/db');
const { logActivity } = require('../src/utils/logger');

/**
 * GET /api/products
 * Returns all active products. Supports query filters:
 *   ?search=keyword   — matches name or SKU
 *   ?category_id=N    — filter by category
 *   ?supplier_id=N    — filter by supplier
 *   ?location_id=N    — returns stock for one location
 */
exports.getAllProducts = async (req, res, next) => {
  try {
    const { search, category_id, supplier_id, location_id } = req.query;
    const products = await productModel.getAllProducts({ search, category_id, supplier_id, location_id });
    return res.json({ success: true, data: products });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/products/:id
 * Returns a single product by ID.
 */
exports.getProductById = async (req, res, next) => {
  try {
    const product = await productModel.getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({ success: true, data: product });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/products/next-sku?location_id=N
 * Returns the next generated SKU for a selected location.
 */
exports.getNextSku = async (req, res, next) => {
  try {
    const { location_id } = req.query;
    const locationId = parseInt(location_id, 10);

    if (!location_id || !Number.isInteger(locationId)) {
      return res.status(400).json({ success: false, message: 'location_id is required.' });
    }

    const sku = await productModel.getNextSkuForLocation(locationId);
    if (!sku) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    return res.json({ success: true, data: { sku } });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/products
 * Creates a new product. Requires admin role.
 */
exports.createProduct = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const {
      name,
      location_id,
      category_id,
      supplier_id,
      unit_price,
      reorder_level,
      track_expiry,
      unit_of_measure,
      notes,
      expiry_date, // Added optional expiry date for the initial batch
      initial_quantity, // Optional initial stock quantity
    } = req.body;
    const locationId = parseInt(location_id, 10);

    // Validate required fields (supplier_id is now optional)
    if (!name || !location_id || !Number.isInteger(locationId) || !category_id || unit_price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'name, location_id, category_id, and unit_price are required.',
      });
    }

    await client.query('BEGIN');
    transactionStarted = true;
    await client.query('SELECT pg_advisory_xact_lock($1)', [locationId]);

    const sku = await productModel.getNextSkuForLocation(locationId, client);
    if (!sku) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    const trimmedNotes = typeof notes === 'string' ? notes.trim() : notes;
    const product = await productModel.createProduct({
      name,
      sku,
      category_id,
      supplier_id: supplier_id || null,
      unit_price,
      reorder_level,
      track_expiry,
      unit_of_measure,
      notes: trimmedNotes ? trimmedNotes : null,
    }, client);

    // If an expiry date was provided, create an initial batch (with 0 quantity)
    // to "auto-track" that specific expiry date for this product at this location.
    if (track_expiry && expiry_date) {
      await productModel.insertInitialBatch(client, {
        product_id: product.id,
        location_id: locationId,
        sku,
        expiry_date,
      });
    }

    // Seed initial stock quantity at the selected location
    const initQty = parseInt(initial_quantity, 10) || 0;
    if (initQty > 0) {
      await productModel.upsertInitialStock(client, {
        product_id: product.id,
        location_id: locationId,
        quantity: initQty,
        location_sku: product.sku,
      });
    }

    await client.query('COMMIT');
    transactionStarted = false;

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'CREATE_PRODUCT', 'products', product.id, {
      name: product.name,
      sku: product.sku,
      initial_quantity: initQty,
    }, locationId);

    return res.status(201).json({ success: true, data: product });
  } catch (err) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }

    // Handle unique constraint violation (duplicate SKU)
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A product with this SKU already exists.',
      });
    }
    // Handle soft-deleted reference (category or supplier is deleted)
    if (err.message && err.message.includes('soft-deleted record')) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reference a deleted category or supplier.',
      });
    }
    return next(err);
  } finally {
    client.release();
  }
};

/**
 * PUT /api/products/:id
 * Updates an existing product.
 */
exports.updateProduct = async (req, res, next) => {
  try {
    const {
      name,
      sku,
      category_id,
      supplier_id,
      unit_price,
      reorder_level,
      track_expiry,
      unit_of_measure,
      notes,
    } = req.body;

    // Treat an empty/whitespace notes string as an explicit clear (null) so
    // the user can wipe a previous note. `undefined` means "don't touch".
    let notesNormalized;
    if (notes === undefined) {
      notesNormalized = undefined;
    } else if (notes === null) {
      notesNormalized = null;
    } else {
      const trimmed = String(notes).trim();
      notesNormalized = trimmed === '' ? null : trimmed;
    }

    const updated = await productModel.updateProduct(req.params.id, {
      name,
      sku,
      category_id,
      supplier_id,
      unit_price,
      reorder_level,
      track_expiry,
      unit_of_measure,
      notes: notesNormalized,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (track_expiry && req.body.expiry_date) {
      // Check if an INIT- batch already exists for this product
      const existingBatch = await productModel.findInitBatchByProduct(req.params.id);

      if (existingBatch) {
        // Update the existing initial batch
        await productModel.updateInitBatchExpiry(req.params.id, req.body.expiry_date);
      } else {
        // No INIT- batch exists yet — create one using the product's primary location
        const locationId = await productModel.findPrimaryLocationId(req.params.id);

        if (locationId) {
          await productModel.insertInitialBatchFromProductSku(req.params.id, locationId, req.body.expiry_date);
        }
      }
    }

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'UPDATE_PRODUCT', 'products', updated.id, {
      updatedFields: Object.keys(req.body),
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A product with this SKU already exists.',
      });
    }
    if (err.message && err.message.includes('soft-deleted record')) {
      return res.status(400).json({
        success: false,
        message: 'Cannot reference a deleted category or supplier.',
      });
    }
    return next(err);
  }
};

/**
 * DELETE /api/products/:id
 * Soft-deletes a product. Requires admin role.
 */
exports.deleteProduct = async (req, res, next) => {
  try {
    const deleted = await productModel.softDeleteProduct(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'DELETE_PRODUCT', 'products', deleted.id);

    return res.json({ success: true, message: 'Product deleted successfully.' });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/products/:id/set-stock
 * Body: { target_quantity: number, location_id?: number }
 *
 * Sets the product's total on-hand quantity to `target_quantity`. The delta
 * is applied as a single stock adjustment at the chosen location (or the
 * product's primary location — the one currently holding the most stock —
 * if none was supplied). The adjustment is recorded under an auto-created
 * MANUAL_EDIT reason code so the audit trail stays intact.
 *
 * Returns 409 if a single-location adjustment can't satisfy the delta
 * (e.g. user asks to drop total to 0 but the primary location only holds
 * part of the stock). In that case the user has to redistribute via the
 * Adjustments page.
 */
exports.setStock = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const productId = parseInt(req.params.id, 10);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product id.' });
    }

    const targetRaw = req.body && req.body.target_quantity;
    const targetQuantity = Number(targetRaw);
    if (!Number.isFinite(targetQuantity) || !Number.isInteger(targetQuantity) || targetQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: 'target_quantity must be a non-negative integer.',
      });
    }

    const product = await productModel.getProductById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const currentTotal = Number(product.total_stock || 0);
    const delta = targetQuantity - currentTotal;
    if (delta === 0) {
      return res.json({ success: true, message: 'No change.', data: { delta: 0 } });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    // Pick the location to apply the change to. Caller can specify;
    // otherwise we use the location currently holding the most stock,
    // falling back to the first known location for this product.
    let locationId = parseInt(req.body && req.body.location_id, 10);
    if (!Number.isInteger(locationId)) {
      const primary = await stockModel.getPrimaryLocationStock(productId, client);
      if (!primary) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: 'This product has no location assigned yet. Use the Adjustments page to seed stock.',
        });
      }
      locationId = primary.location_id;
    }

    // For decreases, make sure the chosen location can absorb the full
    // delta without going negative. If not, surface a 409 so the user
    // knows they need the multi-location Adjustments flow.
    if (delta < 0) {
      const available = await stockModel.getQuantityAt(productId, locationId, client);
      if (available < Math.abs(delta)) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: `The chosen location only holds ${available} units. Use the Adjustments page to redistribute stock across locations.`,
        });
      }
    }

    // Find or create the MANUAL_EDIT reason code so the adjustment can be
    // categorized later. Created lazily so a fresh install doesn't fail.
    let reason = (await reasonCodeModel.getAll()).find((r) => r.code === 'MANUAL_EDIT');
    if (!reason) {
      reason = await reasonCodeModel.create({
        code: 'MANUAL_EDIT',
        description: 'Stock total edited from the Products page',
        adjustment_type: 'BOTH',
      });
    }

    const adjustmentType = delta > 0 ? 'INCREASE' : 'DECREASE';
    const quantityChange = Math.abs(delta);

    const adjustment = await adjustmentModel.createAdjustment(client, {
      product_id: productId,
      location_id: locationId,
      to_location_id: null,
      batch_id: null,
      adjustment_type: adjustmentType,
      quantity_change: quantityChange,
      reason_code_id: reason.id,
      notes: `Total stock set to ${targetQuantity} from Products page (was ${currentTotal}).`,
      user_id: req.user.id,
    });

    if (adjustmentType === 'INCREASE') {
      await stockModel.incrementStock(productId, locationId, quantityChange, client);
    } else {
      await stockModel.decrementStock(productId, locationId, quantityChange, client);
    }

    await client.query('COMMIT');
    transactionStarted = false;

    void logActivity(req.user.id, `STOCK_${adjustmentType}`, 'products', productId, {
      via: 'set-stock',
      target_quantity: targetQuantity,
      previous_total: currentTotal,
      delta,
      location_id: locationId,
    }, locationId);

    return res.json({
      success: true,
      data: {
        product_id: productId,
        location_id: locationId,
        delta,
        target_quantity: targetQuantity,
        adjustment_id: adjustment.id,
      },
    });
  } catch (err) {
    if (transactionStarted) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    if (err.message && err.message.includes('Insufficient stock')) {
      return res.status(409).json({ success: false, message: err.message });
    }
    return next(err);
  } finally {
    client.release();
  }
};

/**
 * POST /api/products/:id/adjust-stock
 * Body: { changes: [{ location_id, target_quantity }, ...] }
 *
 * Applies per-location stock changes in a single transaction. For each
 * change, calculates the delta between the location's current quantity
 * and the requested target, then creates an INCREASE or DECREASE stock
 * adjustment for that location. Rolls back the whole batch if any single
 * change is invalid (negative target, insufficient stock to decrement,
 * etc.), so partial saves never happen.
 *
 * Unlike `setStock`, this endpoint never picks a primary location —
 * every change is location-scoped. Suited for the per-location editor on
 * the Products page.
 */
exports.adjustStock = async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const productId = parseInt(req.params.id, 10);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product id.' });
    }

    const changes = Array.isArray(req.body && req.body.changes) ? req.body.changes : [];
    if (changes.length === 0) {
      return res.status(400).json({ success: false, message: 'No changes supplied.' });
    }

    // Validate every entry up front so we don't open a transaction for
    // input we'll reject anyway.
    const normalized = [];
    for (const c of changes) {
      const locationId = parseInt(c && c.location_id, 10);
      const target = Number(c && c.target_quantity);
      if (!Number.isInteger(locationId) || locationId <= 0) {
        return res.status(400).json({ success: false, message: 'Each change needs a valid location_id.' });
      }
      if (!Number.isFinite(target) || !Number.isInteger(target) || target < 0) {
        return res.status(400).json({ success: false, message: 'target_quantity must be a non-negative integer.' });
      }
      normalized.push({ location_id: locationId, target_quantity: target });
    }

    const product = await productModel.getProductById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // Auto-create the MANUAL_EDIT reason code once so adjustments can be
    // categorized later without forcing the operator to pick one.
    let reason = (await reasonCodeModel.getAll()).find((r) => r.code === 'MANUAL_EDIT');
    if (!reason) {
      reason = await reasonCodeModel.create({
        code: 'MANUAL_EDIT',
        description: 'Stock total edited from the Products page',
        adjustment_type: 'BOTH',
      });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const applied = [];
    for (const change of normalized) {
      // Read current qty under a row lock so concurrent edits don't race
      // each other into negative stock. New locations have no row yet —
      // treated as quantity 0.
      const currentQty = await stockModel.lockQuantityAt(client, productId, change.location_id);
      const delta = change.target_quantity - currentQty;

      if (delta === 0) continue;
      if (delta < 0 && currentQty + delta < 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: `Cannot reduce location ${change.location_id} below 0 (currently ${currentQty}).`,
        });
      }

      const adjustmentType = delta > 0 ? 'INCREASE' : 'DECREASE';
      const quantityChange = Math.abs(delta);

      const adjustment = await adjustmentModel.createAdjustment(client, {
        product_id: productId,
        location_id: change.location_id,
        to_location_id: null,
        batch_id: null,
        adjustment_type: adjustmentType,
        quantity_change: quantityChange,
        reason_code_id: reason.id,
        notes: `Set to ${change.target_quantity} from Products page (was ${currentQty}).`,
        user_id: req.user.id,
      });

      if (adjustmentType === 'INCREASE') {
        await stockModel.incrementStock(productId, change.location_id, quantityChange, client);
      } else {
        await stockModel.decrementStock(productId, change.location_id, quantityChange, client);
      }

      applied.push({
        location_id: change.location_id,
        delta,
        target_quantity: change.target_quantity,
        adjustment_id: adjustment.id,
      });
    }

    await client.query('COMMIT');
    transactionStarted = false;

    if (applied.length > 0) {
      void logActivity(req.user.id, 'ADJUST_STOCK_BATCH', 'products', productId, {
        via: 'products-page',
        applied,
      });
    }

    return res.json({ success: true, data: { product_id: productId, applied } });
  } catch (err) {
    if (transactionStarted) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    if (err.message && err.message.includes('Insufficient stock')) {
      return res.status(409).json({ success: false, message: err.message });
    }
    return next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/products/:id/stock
 * Returns stock levels per location for a product.
 */
exports.getProductStock = async (req, res, next) => {
  try {
    const product = await productModel.getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const stock = await stockModel.getStockByProduct(req.params.id);
    return res.json({ success: true, data: stock });
  } catch (err) {
    return next(err);
  }
};
