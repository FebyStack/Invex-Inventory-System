const path = require('path');
const fs = require('fs');
const { pool, query } = require('../src/config/db');
const csvHelper = require('../src/utils/csvHelper');
const excelHelper = require('../src/utils/excelHelper');
const productModel = require('../models/productModel');

// ── Import-template fields ─────────────────────────────────────────────
// SKU, category_id, supplier_id are *intentionally* not in the template.
// The system auto-generates the SKU at commit time (per chosen location);
// category and supplier are picked in the post-import review modal.
const TEMPLATE_FIELDS = [
  'name',
  'initial_quantity',
  'unit_of_measure',
  'reorder_level',
  'unit_price',
  'expiry_date',
];

const toBool = (v) =>
  v === true || String(v).toLowerCase() === 'true' || v === 1 || v === '1';

// Stricter numeric parsing — `parseInt('10abc', 10)` returns 10, which we don't
// want for an import that the user expects to be validated. `Number(s)` returns
// NaN unless the entire string is numeric, which is what we want here.
const toIntStrict = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
const toDecimalStrict = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function normalizeRow(raw) {
  const get = (k) => (raw[k] === undefined ? raw[k.toUpperCase()] : raw[k]);
  const name = get('name') ? String(get('name')).trim() : '';
  const unit_of_measure = get('unit_of_measure')
    ? String(get('unit_of_measure')).trim()
    : 'pcs';
  const iq = toIntStrict(get('initial_quantity'));
  const initial_quantity = iq === null ? 0 : iq;
  const rl = toIntStrict(get('reorder_level'));
  const reorder_level = rl === null ? 0 : rl;
  const up = toDecimalStrict(get('unit_price'));
  const unit_price = up === null ? NaN : up;
  const expRaw = get('expiry_date');
  const expiry_date = expRaw ? String(expRaw).trim() : null;
  return { name, initial_quantity, unit_of_measure, reorder_level, unit_price, expiry_date };
}

function validateRow(row) {
  const errors = [];
  if (!row.name) errors.push('name is required');
  if (Number.isNaN(row.unit_price) || row.unit_price < 0) {
    errors.push('unit_price must be a non-negative number');
  }
  if (Number.isNaN(row.reorder_level) || row.reorder_level < 0) {
    errors.push('reorder_level must be a non-negative integer');
  }
  if (Number.isNaN(row.initial_quantity) || row.initial_quantity < 0) {
    errors.push('initial_quantity must be a non-negative integer');
  }
  if (row.expiry_date) {
    const d = new Date(row.expiry_date);
    if (Number.isNaN(d.getTime())) {
      errors.push('expiry_date must be a valid date (e.g. 2026-12-31)');
    }
  }
  return errors;
}

// POST /api/import/products
// Step 1 of the import flow. Parses the uploaded file, validates the
// template fields, and returns the normalized rows for the review modal.
// Nothing is written to the database yet.
const importProducts = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Please upload a CSV or Excel file' });
  }

  const filePath = req.file.path;
  const fileExtension = path.extname(req.file.originalname).toLowerCase();
  let parsed = [];

  try {
    if (fileExtension === '.csv') {
      parsed = await csvHelper.parseCSV(filePath);
    } else if (fileExtension === '.xlsx') {
      parsed = await excelHelper.parseExcel(filePath);
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported file format' });
    }
  } catch (parseError) {
    return res
      .status(400)
      .json({ success: false, message: 'Error parsing file', error: parseError.message });
  } finally {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }

  if (parsed.length === 0) {
    return res.status(400).json({ success: false, message: 'The uploaded file is empty' });
  }

  const rows = [];
  const errors = [];
  parsed.forEach((raw, idx) => {
    const norm = normalizeRow(raw);
    const rowErrors = validateRow(norm);
    if (rowErrors.length > 0) {
      errors.push({ row: idx + 2, errors: rowErrors });
    } else {
      rows.push(norm);
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed. Fix the rows below and re-upload.',
      errors,
    });
  }

  return res.json({
    success: true,
    message: `Parsed ${rows.length} row${rows.length === 1 ? '' : 's'}.`,
    fields: TEMPLATE_FIELDS,
    data: rows,
  });
};

// POST /api/import/products/commit
// Step 2: takes the reviewed rows (each with location_id + category_id +
// optional supplier_id), auto-generates SKUs, creates products, seeds
// initial stock, and creates an initial batch when an expiry_date is given.
const commitImportedProducts = async (req, res, next) => {
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: 'No rows to import.' });
  }

  // Pre-flight reference checks so we fail fast before opening a tx.
  const [catRes, supRes, locRes] = await Promise.all([
    query('SELECT id FROM invex.categories WHERE is_deleted = false'),
    query('SELECT id FROM invex.suppliers WHERE is_deleted = false'),
    query('SELECT id FROM invex.locations WHERE is_deleted = false'),
  ]);
  const validCats = new Set(catRes.rows.map((r) => r.id));
  const validSups = new Set(supRes.rows.map((r) => r.id));
  const validLocs = new Set(locRes.rows.map((r) => r.id));

  const errors = [];
  const cleaned = rows.map((raw, idx) => {
    const r = normalizeRow(raw);
    const location_id = toIntStrict(raw.location_id);
    const category_id = toIntStrict(raw.category_id);
    const supplier_id = toIntStrict(raw.supplier_id);

    const rowErrors = validateRow(r);
    if (!Number.isInteger(location_id) || !validLocs.has(location_id)) {
      rowErrors.push('location_id is required and must reference an active location');
    }
    if (!Number.isInteger(category_id) || !validCats.has(category_id)) {
      rowErrors.push('category_id is required and must reference an active category');
    }
    if (supplier_id !== null && (!Number.isInteger(supplier_id) || !validSups.has(supplier_id))) {
      rowErrors.push('supplier_id must reference an active supplier');
    }
    if (rowErrors.length) errors.push({ row: idx + 1, errors: rowErrors });

    return { ...r, location_id, category_id, supplier_id };
  });

  if (errors.length) {
    return res.status(400).json({
      success: false,
      message: 'Some rows are missing required selections.',
      errors,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock each touched location so concurrent imports get distinct SKUs.
    const locks = Array.from(new Set(cleaned.map((r) => r.location_id))).sort((a, b) => a - b);
    for (const lid of locks) {
      await client.query('SELECT pg_advisory_xact_lock($1)', [lid]);
    }

    const created = [];
    for (const r of cleaned) {
      const sku = await productModel.getNextSkuForLocation(r.location_id, client);
      if (!sku) throw new Error(`Location ${r.location_id} not found.`);

      const trackExpiry = !!r.expiry_date;
      const productRes = await client.query(
        `INSERT INTO invex.products
           (name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, sku, name`,
        [
          r.name, sku, r.category_id, r.supplier_id,
          r.unit_price, r.reorder_level, trackExpiry,
          r.unit_of_measure || 'pcs',
        ]
      );
      const product = productRes.rows[0];

      if (trackExpiry) {
        await client.query(
          `INSERT INTO invex.product_batches (product_id, location_id, batch_no, quantity, expiry_date)
           VALUES ($1, $2, $3, $4, $5)`,
          [product.id, r.location_id, 'INIT-' + sku, 0, r.expiry_date]
        );
      }

      if (r.initial_quantity > 0) {
        await client.query(
          `INSERT INTO invex.product_stock (product_id, location_id, quantity, location_sku)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (product_id, location_id)
           DO UPDATE SET quantity = invex.product_stock.quantity + EXCLUDED.quantity,
                         location_sku = COALESCE(invex.product_stock.location_sku, EXCLUDED.location_sku),
                         last_updated = CURRENT_TIMESTAMP`,
          [product.id, r.location_id, r.initial_quantity, sku]
        );
      }

      created.push({ id: product.id, sku: product.sku, name: product.name });
    }

    await client.query('COMMIT');

    void logActivity(req.user.id, 'IMPORT_PRODUCTS', 'products', null, {
      count: created.length,
      message: `Imported ${created.length} products via file`
    });

    return res.status(201).json({
      success: true,
      message: `Successfully imported ${created.length} product${created.length === 1 ? '' : 's'}.`,
      data: created,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A SKU collision occurred — please retry the import.',
      });
    }
    return next(err);
  } finally {
    client.release();
  }
};

// Helper for exporting
const sendExportFile = async (res, data, format, filenameBase) => {
  if (format === 'xlsx') {
    const buffer = await excelHelper.toExcel(data);
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } else {
    // Default to CSV
    const csvStr = csvHelper.toCSV(data);
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csvStr);
  }
};

// GET /api/export/products
const exportProducts = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { location_id } = req.query;
    const values = [];
    let whereClause = '';
    let joinClause = '';
    let filenameBase = 'products';

    if (location_id) {
      joinClause = 'JOIN invex.product_stock ps ON p.id = ps.product_id';
      whereClause = 'WHERE ps.location_id = $1';
      values.push(location_id);
      
      const locRes = await query('SELECT name FROM invex.locations WHERE id = $1', [location_id]);
      if (locRes.rows.length > 0) {
        const safeName = locRes.rows[0].name.replace(/[^a-z0-9]/gi, '-');
        filenameBase += `-${safeName}`;
      }
    }
    
    const result = await query(`
      SELECT 
        p.id, p.name, p.sku, 
        c.name as category_name, 
        s.name as supplier_name, 
        p.unit_price, p.reorder_level, 
        p.track_expiry, p.unit_of_measure, 
        p.created_at
      FROM invex.active_products p
      LEFT JOIN invex.categories c ON p.category_id = c.id
      LEFT JOIN invex.suppliers s ON p.supplier_id = s.id
      ${joinClause}
      ${whereClause}
      ORDER BY p.id ASC
    `, values);

    await sendExportFile(res, result.rows, format, filenameBase);
  } catch (error) {
    next(error);
  }
};

// GET /api/export/stock-report
const exportStockReport = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { location_id } = req.query;
    const values = [];
    let whereClause = '';
    let filenameBase = 'stock-report';

    if (location_id) {
      whereClause = 'WHERE ps.location_id = $1';
      values.push(location_id);
      
      // Fetch location name for the filename
      const locRes = await query('SELECT name FROM invex.locations WHERE id = $1', [location_id]);
      if (locRes.rows.length > 0) {
        const safeName = locRes.rows[0].name.replace(/[^a-z0-9]/gi, '-');
        filenameBase += `-${safeName}`;
      }
    }
    
    const result = await query(`
      SELECT 
        COALESCE(ps.location_sku, p.sku) AS sku,
        p.name as product_name,
        l.name as location_name,
        ps.quantity as current_stock,
        p.reorder_level,
        CASE WHEN ps.quantity < p.reorder_level THEN 'LOW STOCK' ELSE 'OK' END as status,
        ps.last_updated
      FROM invex.product_stock ps
      JOIN invex.active_products p ON ps.product_id = p.id
      JOIN invex.active_locations l ON ps.location_id = l.id
      WHERE (ps.quantity > 0 OR ps.location_sku IS NOT NULL)
        ${location_id ? `AND ps.location_id = $1` : ''}
      ORDER BY l.name ASC, p.name ASC
    `, values);

    await sendExportFile(res, result.rows, format, filenameBase);
  } catch (error) {
    next(error);
  }
};

// GET /api/export/movement-log
const exportMovementLog = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { location_id } = req.query;
    const values = [];
    let whereClause = '';
    let filenameBase = 'movement-log';

    if (location_id) {
      whereClause = 'WHERE sm.location_id = $1';
      values.push(location_id);

      // Fetch location name for the filename
      const locRes = await query('SELECT name FROM invex.locations WHERE id = $1', [location_id]);
      if (locRes.rows.length > 0) {
        const safeName = locRes.rows[0].name.replace(/[^a-z0-9]/gi, '-');
        filenameBase += `-${safeName}`;
      }
    }
    
    const result = await query(`
      SELECT 
        sm.movement_id,
        sm.movement_date,
        COALESCE(ps.location_sku, p.sku) AS sku,
        p.name as product_name,
        sm.quantity_change,
        l.name as location_name,
        u.username as performed_by,
        sm.source_type,
        sm.notes
      FROM invex.stock_movements sm
      JOIN invex.products p ON sm.product_id = p.id
      JOIN invex.locations l ON sm.location_id = l.id
      LEFT JOIN invex.product_stock ps
        ON ps.product_id = sm.product_id
       AND ps.location_id = sm.location_id
      LEFT JOIN invex.users u ON sm.user_id = u.id
      ${whereClause}
      ORDER BY sm.movement_date DESC
    `, values);

    await sendExportFile(res, result.rows, format, filenameBase);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  importProducts,
  commitImportedProducts,
  exportProducts,
  exportStockReport,
  exportMovementLog
};
