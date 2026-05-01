const locationModel = require('../models/locationModel');
const adjustmentModel = require('../models/adjustmentModel');
const reasonCodeModel = require('../models/reasonCodeModel');
const stockModel = require('../src/models/stockModel');
const { pool } = require('../src/config/db');
const { logActivity } = require('../src/utils/logger');

const normalizeLocationType = (type) => {
  if (type === undefined || type === null) return type;
  const normalized = String(type).toLowerCase();
  return normalized === 'virtual' ? 'storeroom' : normalized;
};

const buildLocationCodeBase = (name) => {
  const words = String(name || '').trim().toUpperCase().match(/[A-Z0-9]+/g) || [];
  if (words.length > 1) {
    return words.map((word) => word[0]).join('').slice(0, 6);
  }
  return (words[0] || 'LOC').slice(0, 6);
};

const generateLocationCode = async (name) => {
  const base = buildLocationCodeBase(name);

  for (let i = 1; i <= 99; i++) {
    const code = `${base}-${String(i).padStart(2, '0')}`;
    const exists = await locationModel.locationCodeExists(code);
    if (!exists) return code;
  }

  return `${base}-${Date.now().toString().slice(-6)}`;
};

exports.getAllLocations = async (req, res, next) => {
  try {
    const locations = await locationModel.getAllLocations();
    return res.json({ success: true, data: locations });
  } catch (err) {
    return next(err);
  }
};

exports.getLocationById = async (req, res, next) => {
  try {
    const location = await locationModel.getLocationById(req.params.id);

    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    return res.json({ success: true, data: location });
  } catch (err) {
    return next(err);
  }
};

exports.createLocation = async (req, res, next) => {
  try {
    const { name, code, address_line, barangay, city, province, postal_code, type, color } = req.body;
    const normalizedType = normalizeLocationType(type);

    if (!name || !normalizedType) {
      return res.status(400).json({
        success: false,
        message: 'name and type are required.',
      });
    }

    if (!['warehouse', 'store', 'storeroom'].includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message: 'type must be warehouse, store, or storeroom.',
      });
    }

    let locationCode = code ? String(code).trim().toUpperCase() : await generateLocationCode(name);
    if (await locationModel.locationCodeExists(locationCode)) {
      locationCode = await generateLocationCode(name);
    }

    const location = await locationModel.createLocation({
      name,
      code: locationCode,
      address_line,
      barangay,
      city,
      province,
      postal_code,
      type: normalizedType,
      color: color || '#6c757d',
    });

    void logActivity(req.user.id, 'CREATE_LOCATION', 'locations', location.id, {
      name: location.name,
      code: location.code,
    }, location.id);

    return res.status(201).json({ success: true, data: location });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A location with this code already exists.',
      });
    }
    return next(err);
  }
};

exports.updateLocation = async (req, res, next) => {
  try {
    const { name, code, address_line, barangay, city, province, postal_code, type, color } = req.body;
    const normalizedType = normalizeLocationType(type);

    if (normalizedType && !['warehouse', 'store', 'storeroom'].includes(normalizedType)) {
      return res.status(400).json({
        success: false,
        message: 'type must be warehouse, store, or storeroom.',
      });
    }

    const updated = await locationModel.updateLocation(req.params.id, {
      name,
      code,
      address_line,
      barangay,
      city,
      province,
      postal_code,
      type: normalizedType,
      color: color === undefined ? undefined : color || '#6c757d',
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    void logActivity(req.user.id, 'UPDATE_LOCATION', 'locations', updated.id, {
      updatedFields: Object.keys(req.body),
    }, updated.id);

    return res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'A location with this code already exists.',
      });
    }
    return next(err);
  }
};

exports.getSummary = async (req, res, next) => {
  try {
    const summary = await locationModel.getLocationSummary();
    return res.json({ success: true, data: summary });
  } catch (err) {
    return next(err);
  }
};

exports.getInventoryMatrix = async (req, res, next) => {
  try {
    const matrix = await locationModel.getInventoryMatrix();
    return res.json({ success: true, data: matrix });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/locations/import-stock
 * Body: { product_id, allocations: [{ location_id, quantity }, ...], notes? }
 * Increments product_stock at each allocation in one transaction and writes
 * a stock_adjustment entry per allocation using the RECEIVE reason code.
 * Auto-creates the RECEIVE reason code if it doesn't exist.
 */
exports.importStock = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { product_id, allocations, notes } = req.body;

    if (!product_id || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'product_id and a non-empty allocations array are required.',
      });
    }

    const valid = allocations
      .map((a) => ({ location_id: a.location_id, quantity: Number(a.quantity) }))
      .filter((a) => a.location_id && a.quantity > 0);

    if (valid.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one allocation must have a positive quantity.',
      });
    }

    // Find or create RECEIVE reason code so audit trail is intact.
    let receive = (await reasonCodeModel.getAll()).find((r) => r.code === 'RECEIVE');
    if (!receive) {
      receive = await reasonCodeModel.create({
        code: 'RECEIVE',
        description: 'Stock received into a location',
        adjustment_type: 'INCREASE',
      });
    }

    await client.query('BEGIN');

    const results = [];
    for (const a of valid) {
      const adj = await adjustmentModel.createAdjustment(client, {
        product_id,
        location_id: a.location_id,
        batch_id: null,
        adjustment_type: 'INCREASE',
        quantity_change: a.quantity,
        reason_code_id: receive.id,
        notes: notes || 'Imported via Locations page',
        user_id: req.user.id,
      });
      await stockModel.incrementStock(product_id, a.location_id, a.quantity, client);
      results.push(adj);
    }

    await client.query('COMMIT');

    void logActivity(req.user.id, 'IMPORT_STOCK', 'stock_adjustments', null, {
      product_id,
      allocations: valid,
    });

    const total = valid.reduce((s, a) => s + a.quantity, 0);
    return res.status(201).json({
      success: true,
      data: { imported: results.length, total_units: total, adjustments: results },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
};

exports.deleteLocation = async (req, res, next) => {
  try {
    const deleted = await locationModel.softDeleteLocation(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Location not found.' });
    }

    void logActivity(req.user.id, 'DELETE_LOCATION', 'locations', deleted.id, null, deleted.id);

    return res.json({ success: true, message: 'Location deleted successfully.' });
  } catch (err) {
    return next(err);
  }
};
