const { query } = require('../src/config/db');

exports.getAllCategories = async (req, res) => {
  const result = await query('SELECT * FROM invex.active_categories ORDER BY name ASC');
  res.json({ success: true, data: result.rows });
};

exports.getCategoryById = async (req, res) => {
  const result = await query('SELECT * FROM invex.active_categories WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Category not found' });
  res.json({ success: true, data: result.rows[0] });
};

exports.createCategory = async (req, res) => {
  const { name, description } = req.body;
  const result = await query(
    'INSERT INTO invex.categories (name, description) VALUES ($1, $2) RETURNING *',
    [name, description]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
};

exports.updateCategory = async (req, res) => {
  const { name, description } = req.body;
  const result = await query(
    'UPDATE invex.categories SET name = $1, description = $2 WHERE id = $3 AND is_deleted = FALSE RETURNING *',
    [name, description, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Category not found' });
  res.json({ success: true, data: result.rows[0] });
};

exports.deleteCategory = async (req, res) => {
  const result = await query('UPDATE invex.categories SET is_deleted = TRUE WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Category not found' });
  res.json({ success: true, message: 'Category deleted successfully' });
};
