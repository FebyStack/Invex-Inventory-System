const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl,
  max: config.db.poolMax,
  options: '-c search_path=invex',
});

// Poolers such as Supabase's may ignore startup options, so set the schema on every new connection too.
pool.on('connect', (client) => {
  client.query('SET search_path TO invex, public').catch((err) => console.error('❌ search_path:', err.message));
  console.log('📦 Connected to PostgreSQL database (schema: invex)');
});

// A remote database can drop idle connections; the pool discards that client, so log it instead of exiting.
pool.on('error', (err) => {
  console.error('❌ Idle database connection closed:', err.message);
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
