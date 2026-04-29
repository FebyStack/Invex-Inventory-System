const categoryModel = require('../models/categoryModel');
const { logActivity } = require('../src/utils/logger');

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
    const { name, description } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required.',
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
    });

    // Log activity (fire-and-forget)
    void logActivity(req.user.id, 'CREATE_CATEGORY', 'categories', category.id, {
      name: category.name,
      message: 'Category created successfully.',
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully.',
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
    const { name, description } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required.',
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
    });

    void logActivity(req.user.id, 'UPDATE_CATEGORY', 'categories', category.id, {
      name: category.name,
      message: 'Category updated successfully.',
    });

    return res.json({
      success: true,
      message: 'Category updated successfully.',
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
