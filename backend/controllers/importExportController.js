const path = require('path');
const fs = require('fs');
const { pool } = require('../src/config/db');
const csvHelper = require('../src/utils/csvHelper');
const excelHelper = require('../src/utils/excelHelper');
const productModel = require('../models/productModel');
const locationModel = require('../models/locationModel');
const reportModel = require('../models/reportModel');
const { logActivity } = require('../src/utils/logger');
const notificationService = require('../services/notificationService');

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
  const { categoryIds, supplierIds, locationIds } = await productModel.getActiveImportReferenceIds();
  const validCats = new Set(categoryIds);
  const validSups = new Set(supplierIds);
  const validLocs = new Set(locationIds);

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
      // 1. Check for existing product by name (case-insensitive trim match)
      const existing = await productModel.findActiveByName(r.name, client);

      let productId, productSku;
      const trackExpiry = !!r.expiry_date;

      if (existing) {
        // MATCH FOUND: Use existing product
        productId = existing.id;
        productSku = existing.sku;

        // Optionally update price/unit of measure if they were provided in the CSV
        await productModel.applyImportUpdate(client, productId, {
          unit_price: r.unit_price,
          unit_of_measure: r.unit_of_measure,
          reorder_level: r.reorder_level,
          track_expiry: trackExpiry,
        });
      } else {
        // NO MATCH: Create new product
        productSku = await productModel.getNextSkuForLocation(r.location_id, client);
        if (!productSku) throw new Error(`Location ${r.location_id} not found.`);

        const inserted = await productModel.insertProductMinimal(client, {
          name: r.name,
          sku: productSku,
          category_id: r.category_id,
          supplier_id: r.supplier_id,
          unit_price: r.unit_price,
          reorder_level: r.reorder_level,
          track_expiry: trackExpiry,
          unit_of_measure: r.unit_of_measure,
        });
        productId = inserted.id;
      }

      if (trackExpiry) {
        await productModel.insertInitialBatch(client, {
          product_id: productId,
          location_id: r.location_id,
          sku: productSku,
          expiry_date: r.expiry_date,
        });
      }

      if (r.initial_quantity > 0) {
        await productModel.upsertInitialStock(client, {
          product_id: productId,
          location_id: r.location_id,
          quantity: r.initial_quantity,
          location_sku: productSku,
        });
      }

      created.push({ id: productId, sku: productSku, name: r.name });
    }

    await client.query('COMMIT');

    void logActivity(req.user.id, 'IMPORT_PRODUCTS', 'products', null, {
      count: created.length,
      message: `Imported ${created.length} products via file`
    });

    // Trigger notification scan
    void notificationService.runScan({ silent: true });

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

const appendLocationToFilename = async (baseName, location_id) => {
  const name = await locationModel.getNameById(location_id);
  if (!name) return baseName;
  const safeName = name.replace(/[^a-z0-9]/gi, '-');
  return `${baseName}-${safeName}`;
};

// GET /api/export/products
const exportProducts = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { location_id } = req.query;
    let filenameBase = 'products';

    if (location_id) {
      filenameBase = await appendLocationToFilename(filenameBase, location_id);
    }

    const rows = await reportModel.exportProducts({ location_id });
    await sendExportFile(res, rows, format, filenameBase);
  } catch (error) {
    next(error);
  }
};

// GET /api/export/stock-report
const exportStockReport = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { location_id } = req.query;
    let filenameBase = 'stock-report';

    if (location_id) {
      filenameBase = await appendLocationToFilename(filenameBase, location_id);
    }

    const rows = await reportModel.exportStockReport({ location_id });
    await sendExportFile(res, rows, format, filenameBase);
  } catch (error) {
    next(error);
  }
};

// GET /api/export/movement-log
const exportMovementLog = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { location_id } = req.query;
    let filenameBase = 'movement-log';

    if (location_id) {
      filenameBase = await appendLocationToFilename(filenameBase, location_id);
    }

    const rows = await reportModel.exportMovementLog({ location_id });
    await sendExportFile(res, rows, format, filenameBase);
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
