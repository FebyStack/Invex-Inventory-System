const path = require('path');
const fs = require('fs');
const { pool, query } = require('../src/config/db');
const csvHelper = require('../src/utils/csvHelper');
const excelHelper = require('../src/utils/excelHelper');

/**
 * Validates product data and checks against the database
 */
const validateProducts = async (products) => {
  const errors = [];
  
  // Pre-fetch valid categories and suppliers
  const categoriesRes = await query('SELECT id FROM invex.categories WHERE is_deleted = false');
  const validCategoryIds = new Set(categoriesRes.rows.map(r => r.id));
  
  const suppliersRes = await query('SELECT id FROM invex.suppliers WHERE is_deleted = false');
  const validSupplierIds = new Set(suppliersRes.rows.map(r => r.id));
  
  const existingProductsRes = await query('SELECT sku FROM invex.products');
  const existingSkus = new Set(existingProductsRes.rows.map(r => r.sku));

  const currentFileSkus = new Set();

  products.forEach((product, index) => {
    const rowNum = index + 2; // Assuming row 1 is headers
    const rowErrors = [];

    // Required fields check
    if (!product.sku) rowErrors.push('SKU is required');
    if (!product.name) rowErrors.push('Name is required');
    if (product.category_id === undefined || product.category_id === null) rowErrors.push('category_id is required');
    if (product.supplier_id === undefined || product.supplier_id === null) rowErrors.push('supplier_id is required');
    
    // Numeric and format validation
    if (product.unit_price === undefined || product.unit_price < 0 || isNaN(product.unit_price)) {
      rowErrors.push('unit_price must be a positive number');
    }
    
    if (product.reorder_level !== undefined && (product.reorder_level < 0 || isNaN(product.reorder_level))) {
      rowErrors.push('reorder_level must be a non-negative integer');
    }

    // Referential integrity check
    if (product.category_id && !validCategoryIds.has(product.category_id)) {
      rowErrors.push(`category_id ${product.category_id} does not exist or is deleted`);
    }
    if (product.supplier_id && !validSupplierIds.has(product.supplier_id)) {
      rowErrors.push(`supplier_id ${product.supplier_id} does not exist or is deleted`);
    }

    // Unique SKU check
    if (product.sku) {
      const skuStr = String(product.sku).trim();
      if (existingSkus.has(skuStr)) {
        rowErrors.push(`SKU ${skuStr} already exists in the database`);
      }
      if (currentFileSkus.has(skuStr)) {
        rowErrors.push(`SKU ${skuStr} is a duplicate within the uploaded file`);
      }
      currentFileSkus.add(skuStr);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, errors: rowErrors });
    }
  });

  return errors;
};

// POST /api/import/products
const importProducts = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a CSV or Excel file' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    let products = [];
    
    try {
      if (fileExtension === '.csv') {
        products = await csvHelper.parseCSV(filePath);
      } else if (fileExtension === '.xlsx') {
        products = await excelHelper.parseExcel(filePath);
      } else {
        return res.status(400).json({ success: false, message: 'Unsupported file format' });
      }
    } catch (parseError) {
      return res.status(400).json({ success: false, message: 'Error parsing file', error: parseError.message });
    } finally {
      // Clean up uploaded file
      fs.unlinkSync(filePath);
    }

    if (products.length === 0) {
      return res.status(400).json({ success: false, message: 'The uploaded file is empty' });
    }

    // Validate rows
    const validationErrors = await validateProducts(products);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. No products were imported.',
        errors: validationErrors
      });
    }

    // Proceed with database transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const product of products) {
        const sku = String(product.sku).trim();
        const name = String(product.name).trim();
        const category_id = parseInt(product.category_id, 10);
        const supplier_id = parseInt(product.supplier_id, 10);
        const unit_price = parseFloat(product.unit_price);
        const reorder_level = product.reorder_level !== undefined && product.reorder_level !== null ? parseInt(product.reorder_level, 10) : 0;
        const track_expiry = product.track_expiry === true || String(product.track_expiry).toLowerCase() === 'true';
        const unit_of_measure = product.unit_of_measure ? String(product.unit_of_measure).trim() : 'pcs';

        await client.query(
          `INSERT INTO invex.products (name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [name, sku, category_id, supplier_id, unit_price, reorder_level, track_expiry, unit_of_measure]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, message: `Successfully imported ${products.length} products.` });
    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

// Helper for exporting
const sendExportFile = async (res, data, format, filenameBase) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  if (format === 'xlsx') {
    const buffer = await excelHelper.toExcel(data);
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}-${timestamp}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } else {
    // Default to CSV
    const csvStr = csvHelper.toCSV(data);
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}-${timestamp}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csvStr);
  }
};

// GET /api/export/products
const exportProducts = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    
    const result = await query(`
      SELECT 
        p.id, p.name, p.sku, 
        c.name as category_name, 
        s.name as supplier_name, 
        p.unit_price, p.reorder_level, 
        p.track_expiry, p.unit_of_measure, 
        p.created_at
      FROM invex.active_products p
      JOIN invex.categories c ON p.category_id = c.id
      JOIN invex.suppliers s ON p.supplier_id = s.id
      ORDER BY p.id ASC
    `);

    await sendExportFile(res, result.rows, format, 'products');
  } catch (error) {
    next(error);
  }
};

// GET /api/export/stock-report
const exportStockReport = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    
    const result = await query(`
      SELECT 
        p.sku,
        p.name as product_name,
        l.name as location_name,
        ps.quantity as current_stock,
        p.reorder_level,
        CASE WHEN ps.quantity < p.reorder_level THEN 'LOW STOCK' ELSE 'OK' END as status,
        ps.last_updated
      FROM invex.product_stock ps
      JOIN invex.active_products p ON ps.product_id = p.id
      JOIN invex.active_locations l ON ps.location_id = l.id
      ORDER BY l.name ASC, p.name ASC
    `);

    await sendExportFile(res, result.rows, format, 'stock-report');
  } catch (error) {
    next(error);
  }
};

// GET /api/export/movement-log
const exportMovementLog = async (req, res, next) => {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    
    const result = await query(`
      SELECT 
        sm.movement_id,
        sm.movement_date,
        p.sku,
        p.name as product_name,
        sm.quantity_change,
        l.name as location_name,
        u.username as performed_by,
        sm.source_type,
        sm.notes
      FROM invex.stock_movements sm
      JOIN invex.products p ON sm.product_id = p.id
      JOIN invex.locations l ON sm.location_id = l.id
      LEFT JOIN invex.users u ON sm.user_id = u.id
      ORDER BY sm.movement_date DESC
    `);

    await sendExportFile(res, result.rows, format, 'movement-log');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  importProducts,
  exportProducts,
  exportStockReport,
  exportMovementLog
};
