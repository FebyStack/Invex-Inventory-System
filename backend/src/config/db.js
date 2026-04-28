const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  options: '-c search_path=invex',
});

pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL database (schema: invex)');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
  process.exit(-1);
});

/**
 * Execute a SQL query against the database.
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params) => {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (config.nodeEnv === 'development') {
    console.log('🔍 Query:', { text: text.substring(0, 80), duration: `${duration}ms`, rows: result.rowCount });
  }

  return result;
};

module.exports = { pool, query };
