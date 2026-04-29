const { query } = require('../src/config/db');

exports.getAllSuppliers = async (req, res) => {
  const result = await query('SELECT * FROM invex.active_suppliers ORDER BY name ASC');
  res.json({ success: true, data: result.rows });
};

exports.getSupplierById = async (req, res) => {
  const result = await query('SELECT * FROM invex.active_suppliers WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Supplier not found' });
  res.json({ success: true, data: result.rows[0] });
};

exports.createSupplier = async (req, res) => {
  const { name, contact_person, phone, email, address_line, barangay, city, province, postal_code } = req.body;
  const result = await query(
    `INSERT INTO invex.suppliers 
     (name, contact_person, phone, email, address_line, barangay, city, province, postal_code) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [name, contact_person, phone, email, address_line, barangay, city, province, postal_code]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
};

exports.updateSupplier = async (req, res) => {
  const { name, contact_person, phone, email, address_line, barangay, city, province, postal_code } = req.body;
  const result = await query(
    `UPDATE invex.suppliers 
     SET name = $1, contact_person = $2, phone = $3, email = $4, address_line = $5, 
         barangay = $6, city = $7, province = $8, postal_code = $9 
     WHERE id = $10 AND is_deleted = FALSE RETURNING *`,
    [name, contact_person, phone, email, address_line, barangay, city, province, postal_code, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Supplier not found' });
  res.json({ success: true, data: result.rows[0] });
};

exports.deleteSupplier = async (req, res) => {
  const result = await query('UPDATE invex.suppliers SET is_deleted = TRUE WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Supplier not found' });
  res.json({ success: true, message: 'Supplier deleted successfully' });
};
