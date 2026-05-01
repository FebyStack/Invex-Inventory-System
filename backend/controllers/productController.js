const productModel = require('../models/productModel');
const stockModel = require('../src/models/stockModel');
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

    const product = await productModel.createProduct({
      name,
      sku,
      category_id,
      supplier_id: supplier_id || null,
      unit_price,
      reorder_level,
      track_expiry,
      unit_of_measure,
    }, client);

    // If an expiry date was provided, create an initial batch (with 0 quantity)
    // to "auto-track" that specific expiry date for this product at this location.
    if (track_expiry && expiry_date) {
      await client.query(
        `INSERT INTO invex.product_batches (product_id, location_id, batch_no, quantity, expiry_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [product.id, locationId, 'INIT-' + sku, 0, expiry_date]
      );
    }

    // Seed initial stock quantity at the selected location
    const initQty = parseInt(initial_quantity, 10) || 0;
    if (initQty > 0) {
      await client.query(
        `INSERT INTO invex.product_stock (product_id, location_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, location_id)
         DO UPDATE SET quantity = invex.product_stock.quantity + EXCLUDED.quantity,
                       last_updated = CURRENT_TIMESTAMP`,
        [product.id, locationId, initQty]
      );
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
    } = req.body;

    const updated = await productModel.updateProduct(req.params.id, {
      name,
      sku,
      category_id,
      supplier_id,
      unit_price,
      reorder_level,
      track_expiry,
      unit_of_measure,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
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
