const { query } = require('../src/config/db');

exports.getAllReasonCodes = async (req, res) => {
  const result = await query('SELECT * FROM invex.reason_codes ORDER BY code ASC');
  res.json({ success: true, data: result.rows });
};

exports.getReasonCodeById = async (req, res) => {
  const result = await query('SELECT * FROM invex.reason_codes WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Reason code not found' });
  res.json({ success: true, data: result.rows[0] });
};

exports.createReasonCode = async (req, res) => {
  const { code, description, adjustment_type } = req.body;
  const result = await query(
    'INSERT INTO invex.reason_codes (code, description, adjustment_type) VALUES ($1, $2, $3) RETURNING *',
    [code, description, adjustment_type]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
};

exports.updateReasonCode = async (req, res) => {
  const { code, description, adjustment_type } = req.body;
  const result = await query(
    'UPDATE invex.reason_codes SET code = $1, description = $2, adjustment_type = $3 WHERE id = $4 RETURNING *',
    [code, description, adjustment_type, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Reason code not found' });
  res.json({ success: true, data: result.rows[0] });
};

exports.deleteReasonCode = async (req, res) => {
  const result = await query('DELETE FROM invex.reason_codes WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ success: false, message: 'Reason code not found' });
  res.json({ success: true, message: 'Reason code deleted successfully' });
};
