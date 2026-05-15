const categoryModel = require('../models/categoryModel');
const { logActivity } = require('../src/utils/logger');

// Accept either #RGB, #RRGGBB, or #RRGGBBAA hex values.
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const normalizeColor = (raw) => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = String(raw).trim();
  if (!HEX_COLOR_RE.test(value)) return null; // explicit "invalid" sentinel
  return value;
};

/**
 * GET /api/categories
 * List all active categories.
 */
exports.getAll = async (req, res, next) => {
  try {
    const categories = await categoryModel.getAll();

    return res.json({
      success: true,
      count: categories.length,
      data: categories,
      categories,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/categories/:id
 * Get a single category by ID.
 */
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const category = await categoryModel.getById(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    return res.json({
      success: true,
      category,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/categories
 * Create a new category.
 */
exports.create = async (req, res, next) => {
  try {
    const { name, description, color } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required.',
      });
    }

    const normalizedColor = normalizeColor(color);
    if (normalizedColor === null) {
      return res.status(400).json({
        success: false,
        message: 'Color must be a valid hex value (e.g. #7C7CFF).',
      });
    }

    // Check for duplicate name
    const exists = await categoryModel.nameExists(name.trim());
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'A category with this name already exists.',
      });
    }

    const category = await categoryModel.create({
      name: name.trim(),
      description: description ? description.trim() : null,
      color: normalizedColor,
    });

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'CREATE_CATEGORY', 'categories', category.id, {
      name: category.name,
      message: 'Category created successfully.',
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully.',
      data: category,
      category,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PUT /api/categories/:id
 * Update an existing category.
 */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required.',
      });
    }

    const normalizedColor = normalizeColor(color);
    if (normalizedColor === null) {
      return res.status(400).json({
        success: false,
        message: 'Color must be a valid hex value (e.g. #7C7CFF).',
      });
    }

    // Check that category exists
    const existing = await categoryModel.getById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    // Check for duplicate name (excluding current record)
    const duplicate = await categoryModel.nameExists(name.trim(), id);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'A category with this name already exists.',
      });
    }

    const category = await categoryModel.update(id, {
      name: name.trim(),
      description: description ? description.trim() : null,
      color: normalizedColor,
    });

    void logActivity(req.user.id, 'UPDATE_CATEGORY', 'categories', category.id, {
      name: category.name,
      message: 'Category updated successfully.',
    });

    return res.json({
      success: true,
      message: 'Category updated successfully.',
      data: category,
      category,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * DELETE /api/categories/:id
 * Soft-delete a category.
 */
exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if category has products before deleting
    const category = await categoryModel.getById(id);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    if (category.product_count > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete: ${category.product_count} product${category.product_count === 1 ? '' : 's'} are currently assigned to this category. Reassign or remove the products before deleting the category.`,
      });
    }

    const deleted = await categoryModel.softDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Category not found.',
      });
    }

    void logActivity(req.user.id, 'DELETE_CATEGORY', 'categories', deleted.id, {
      name: deleted.name,
      message: 'Category soft-deleted.',
    });

    return res.json({
      success: true,
      message: 'Category deleted successfully.',
    });
  } catch (error) {
    return next(error);
  }
};
