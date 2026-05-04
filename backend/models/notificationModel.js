const { query } = require('../src/config/db');

/**
 * Upsert a notification on its dedup_key.
 * Returns { row, created } — `created: true` only when this insert produced
 * a brand-new row (not an existing-unread duplicate). The scanner uses
 * `created` to decide whether to email.
 */
async function upsertNotification(n) {
  const result = await query(
    `
    INSERT INTO invex.notifications
      (type, severity, dedup_key, title, body, link)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (dedup_key) DO UPDATE
      SET title = EXCLUDED.title,
          body = EXCLUDED.body,
          severity = EXCLUDED.severity,
          updated_at = CURRENT_TIMESTAMP
    RETURNING *,
      (xmax = 0) AS inserted
    `,
    [n.type, n.severity || 'warning', n.dedup_key, n.title, n.body, n.link || null]
  );
  const row = result.rows[0];
  return { row, created: row.inserted === true };
}

async function listActive(limit = 50) {
  const result = await query(
    `SELECT id, type, severity, dedup_key, title, body, link, is_read,
            email_sent, email_sent_at, created_at, updated_at
     FROM invex.notifications
     WHERE is_read = FALSE
     ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
       created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function markRead(id) {
  await query(
    `UPDATE invex.notifications SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id]
  );
}

async function markAllRead() {
  await query(
    `UPDATE invex.notifications SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP WHERE is_read = FALSE`
  );
}

async function markEmailSent(ids) {
  if (!ids.length) return;
  await query(
    `UPDATE invex.notifications
     SET email_sent = TRUE, email_sent_at = CURRENT_TIMESTAMP
     WHERE id = ANY($1::int[])`,
    [ids]
  );
}

async function getAdminEmails() {
  const result = await query(
    `SELECT email, full_name FROM invex.users
     WHERE role = 'admin' AND is_deleted = FALSE AND email IS NOT NULL AND email <> ''`
  );
  return result.rows;
}

module.exports = {
  upsertNotification,
  listActive,
  markRead,
  markAllRead,
  markEmailSent,
  getAdminEmails,
};
