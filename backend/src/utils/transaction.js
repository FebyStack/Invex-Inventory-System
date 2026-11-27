const { pool } = require('../config/db');

/**
 * An expected failure with a ready HTTP answer, e.g. `throw new HttpError(404, 'Batch not found.')`.
 * Thrown inside withTransaction() it rolls the transaction back; the global error handler then replies
 * `{ success: false, message, ...extra }` with this status.
 */
class HttpError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.extra = extra;
  }
}

/**
 * Run `work(client)` in one database transaction. This is the only place that issues BEGIN / COMMIT / ROLLBACK:
 *
 *   connect → BEGIN → work(client) ─ returns → COMMIT   → release → result
 *                                  └ throws  → ROLLBACK → release → same error rethrown
 *
 * Rules for callers:
 *  - Validate the request and send 4xx replies BEFORE calling this. Do not call `res` inside `work`;
 *    to stop early, throw (HttpError for an expected failure).
 *  - Pass `client` to every model call inside `work`. A call that uses the shared pool instead runs
 *    outside the transaction and takes a second connection (the pool is small on the shared database).
 */
const withTransaction = async (work) => {
  const client = await pool.connect();
  let rollbackError;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      rollbackError = e;
    }
    throw err;
  } finally {
    // A connection whose ROLLBACK failed is in an unknown state: passing the error makes the pool discard it.
    client.release(rollbackError);
  }
};

module.exports = { withTransaction, HttpError };
