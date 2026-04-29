const supplierModel = require('../models/supplierModel');
const { logActivity } = require('../src/utils/logger');

/**
 * GET /api/suppliers
 * List all active suppliers.
 */
exports.getAll = async (req, res, next) => {
  try {
    const suppliers = await supplierModel.getAll();

    return res.json({
      success: true,
      count: suppliers.length,
      suppliers,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/suppliers/:id
 * Get a single supplier by ID.
 */
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const supplier = await supplierModel.getById(id);

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found.',
      });
    }

    return res.json({
      success: true,
      supplier,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/suppliers
 * Create a new supplier.
 */
exports.create = async (req, res, next) => {
  try {
    const { name, contact_person, phone, email, address_line, barangay, city, province, postal_code } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Supplier name is required.',
      });
    }

    const supplier = await supplierModel.create({
      name: name.trim(),
      contact_person: contact_person ? contact_person.trim() : null,
      phone: phone ? phone.trim() : null,
      email: email ? email.trim() : null,
      address_line: address_line ? address_line.trim() : null,
      barangay: barangay ? barangay.trim() : null,
      city: city ? city.trim() : null,
      province: province ? province.trim() : null,
      postal_code: postal_code ? postal_code.trim() : null,
    });

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'CREATE_SUPPLIER', 'suppliers', supplier.id, {
      name: supplier.name,
      message: 'Supplier created successfully.',
    });

    return res.status(201).json({
      success: true,
      message: 'Supplier created successfully.',
      supplier,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PUT /api/suppliers/:id
 * Update an existing supplier.
 */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, contact_person, phone, email, address_line, barangay, city, province, postal_code } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Supplier name is required.',
      });
    }

    // Check that supplier exists
    const existing = await supplierModel.getById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found.',
      });
    }

    const supplier = await supplierModel.update(id, {
      name: name.trim(),
      contact_person: contact_person ? contact_person.trim() : null,
      phone: phone ? phone.trim() : null,
      email: email ? email.trim() : null,
      address_line: address_line ? address_line.trim() : null,
      barangay: barangay ? barangay.trim() : null,
      city: city ? city.trim() : null,
      province: province ? province.trim() : null,
      postal_code: postal_code ? postal_code.trim() : null,
    });

    void logActivity(req.user.id, 'UPDATE_SUPPLIER', 'suppliers', supplier.id, {
      name: supplier.name,
      message: 'Supplier updated successfully.',
    });

    return res.json({
      success: true,
      message: 'Supplier updated successfully.',
      supplier,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * DELETE /api/suppliers/:id
 * Soft-delete a supplier.
 */
exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await supplierModel.softDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Supplier not found.',
      });
    }

    void logActivity(req.user.id, 'DELETE_SUPPLIER', 'suppliers', deleted.id, {
      name: deleted.name,
      message: 'Supplier soft-deleted.',
    });

    return res.json({
      success: true,
      message: 'Supplier deleted successfully.',
    });
  } catch (error) {
    return next(error);
  }
};
