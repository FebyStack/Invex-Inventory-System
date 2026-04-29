const { query } = require('../src/config/db');

exports.getAllBatches = async (req, res) => {
  const result = await query(`
    SELECT b.*, p.name as product_name 
    FROM invex.batches b
    JOIN invex.products p ON b.product_id = p.id
    ORDER BY b.expiry_date ASC
  `);
  res.json({ success: true, data: result.rows });
};

exports.getBatchById = async (req, res) => {
  const result = await query('SELECT * FROM invex.batches WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Batch not found' });
  res.json({ success: true, data: result.rows[0] });
};

exports.createBatch = async (req, res) => {
  const { product_id, batch_number, expiry_date, initial_quantity } = req.body;
  const result = await query(
    'INSERT INTO invex.batches (product_id, batch_number, expiry_date, initial_quantity, current_quantity) VALUES ($1, $2, $3, $4, $4) RETURNING *',
    [product_id, batch_number, expiry_date, initial_quantity]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
};

exports.updateBatch = async (req, res) => {
  const { batch_number, expiry_date } = req.body;
  const result = await query(
    'UPDATE invex.batches SET batch_number = $1, expiry_date = $2 WHERE id = $3 RETURNING *',
    [batch_number, expiry_date, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Batch not found' });
  res.json({ success: true, data: result.rows[0] });
};
