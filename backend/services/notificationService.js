const { query } = require('../src/config/db');
const env = require('../src/config/env');
const notificationModel = require('../models/notificationModel');

// ── Email transport (lazy + optional) ─────────────────────────────────
// nodemailer is optional. If the package isn't installed (or SMTP isn't
// configured), the scanner still creates in-app notifications — it just
// skips the email step instead of crashing the server.
let cachedTransport = null;
let transportLoaded = false;

function getTransport() {
  if (transportLoaded) return cachedTransport;
  transportLoaded = true;
  const { smtp } = env;
  if (!smtp || !smtp.host || !smtp.user || !smtp.pass) {
    return null;
  }
  try {
    const nodemailer = require('nodemailer');
    cachedTransport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    return cachedTransport;
  } catch (err) {
    console.warn('[notifications] nodemailer not installed — skipping email delivery.');
    return null;
  }
}

async function sendEmail({ subject, html, text }) {
  const transport = getTransport();
  if (!transport) return { sent: false, reason: 'no-transport' };

  const admins = await notificationModel.getAdminEmails();
  if (admins.length === 0) return { sent: false, reason: 'no-admins' };

  const to = admins.map((a) => `${a.full_name} <${a.email}>`).join(', ');
  try {
    await transport.sendMail({
      from: env.smtp.from || env.smtp.user,
      to,
      subject,
      text,
      html,
    });
    return { sent: true, recipients: admins.length };
  } catch (err) {
    console.error('[notifications] email send failed:', err.message);
    return { sent: false, reason: 'send-error', error: err.message };
  }
}

// ── Scanners ────────────────────────────────────────────────────────────

async function scanLowStock() {
  // Per-product stock totals across locations vs reorder_level.
  const { rows } = await query(`
    SELECT
      p.id, p.sku, p.name, p.reorder_level,
      COALESCE(SUM(ps.quantity), 0)::int AS current_stock
    FROM invex.active_products p
    LEFT JOIN invex.product_stock ps ON p.id = ps.product_id
    GROUP BY p.id, p.sku, p.name, p.reorder_level
    HAVING COALESCE(SUM(ps.quantity), 0) <= p.reorder_level
  `);

  return rows.map((r) => {
    const isOut = r.current_stock === 0;
    return {
      type: isOut ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      severity: isOut ? 'critical' : 'warning',
      dedup_key: `${isOut ? 'OUT_OF_STOCK' : 'LOW_STOCK'}:${r.id}`,
      title: isOut
        ? `Out of stock — ${r.name}`
        : `Low stock — ${r.name}`,
      body: isOut
        ? `${r.name} (${r.sku}) is out of stock. Reorder level is ${r.reorder_level}.`
        : `${r.name} (${r.sku}) is at ${r.current_stock} units (reorder level ${r.reorder_level}).`,
      link: `/reports.html#low-stock`,
    };
  });
}

async function scanExpiring(daysAhead = 7) {
  // Batches expiring within `daysAhead` days, plus already-expired batches
  // that still hold stock.
  const { rows } = await query(
    `
    SELECT
      pb.id           AS batch_id,
      pb.batch_no,
      pb.quantity,
      pb.expiry_date,
      (pb.expiry_date - CURRENT_DATE)::int AS days_until_expiry,
      p.id            AS product_id,
      p.sku,
      p.name          AS product_name,
      l.id            AS location_id,
      l.name          AS location_name
    FROM invex.product_batches pb
    JOIN invex.active_products p  ON pb.product_id = p.id
    JOIN invex.active_locations l ON pb.location_id = l.id
    WHERE pb.is_deleted = FALSE
      AND pb.quantity > 0
      AND pb.expiry_date <= CURRENT_DATE + ($1 || ' days')::interval
    ORDER BY pb.expiry_date ASC
    `,
    [daysAhead]
  );

  return rows.map((r) => {
    const expired = r.days_until_expiry < 0;
    const exp = new Date(r.expiry_date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const dayLabel =
      expired
        ? `expired ${Math.abs(r.days_until_expiry)} day${Math.abs(r.days_until_expiry) === 1 ? '' : 's'} ago`
        : r.days_until_expiry === 0
          ? 'expires today'
          : `expires in ${r.days_until_expiry} day${r.days_until_expiry === 1 ? '' : 's'}`;
    return {
      type: expired ? 'EXPIRED_BATCH' : 'EXPIRING_BATCH',
      severity: expired || r.days_until_expiry <= 2 ? 'critical' : 'warning',
      dedup_key: `${expired ? 'EXPIRED' : 'EXPIRING'}:batch:${r.batch_id}`,
      title: `${expired ? 'Expired' : 'Expiring'} — ${r.product_name}`,
      body: `Batch ${r.batch_no} (${r.quantity} units) at ${r.location_name} ${dayLabel} (${exp}).`,
      link: `/locations.html?location_id=${r.location_id}`,
    };
  });
}

// ── Email composition ───────────────────────────────────────────────────

function composeDigest(items) {
  const groupBy = (list, key) => list.reduce((acc, x) => {
    const k = key(x);
    (acc[k] = acc[k] || []).push(x);
    return acc;
  }, {});
  const groups = groupBy(items, (i) => i.type);

  const heading = (label, count) =>
    `<h3 style="font:500 14px/1.4 sans-serif;color:#0a0a0b;margin:18px 0 8px;">${label} <span style="color:#888;font-weight:400;">(${count})</span></h3>`;
  const rowFor = (i) =>
    `<tr><td style="padding:6px 12px 6px 0;font:13px/1.5 sans-serif;color:#0a0a0b;">${i.title}</td>` +
    `<td style="padding:6px 0;font:12px/1.5 sans-serif;color:#555;">${i.body}</td></tr>`;

  let html = `<div style="font:14px/1.5 sans-serif;color:#0a0a0b;">` +
    `<p>The Invex inventory scanner flagged the following issues:</p>`;
  let text = 'Invex inventory alerts:\n\n';

  const order = ['OUT_OF_STOCK', 'EXPIRED_BATCH', 'LOW_STOCK', 'EXPIRING_BATCH'];
  const labels = {
    OUT_OF_STOCK: 'Out of stock',
    EXPIRED_BATCH: 'Expired batches',
    LOW_STOCK: 'Low stock',
    EXPIRING_BATCH: 'Batches expiring within 7 days',
  };
  for (const t of order) {
    const list = groups[t];
    if (!list || list.length === 0) continue;
    html += heading(labels[t], list.length) + `<table cellpadding="0" cellspacing="0">` +
      list.map(rowFor).join('') + `</table>`;
    text += `${labels[t]} (${list.length}):\n` +
      list.map((i) => `  • ${i.title} — ${i.body}`).join('\n') + '\n\n';
  }
  html += `<p style="color:#888;font-size:12px;margin-top:24px;">Sign in to Invex to review and resolve these alerts.</p></div>`;

  return { html, text };
}

// ── Public API ──────────────────────────────────────────────────────────

async function runScan({ silent = false } = {}) {
  const findings = [
    ...(await scanLowStock()),
    ...(await scanExpiring(7)),
  ];

  const newlyCreated = [];
  for (const n of findings) {
    try {
      const { row, created } = await notificationModel.upsertNotification(n);
      if (created) newlyCreated.push(row);
    } catch (err) {
      console.error('[notifications] upsert failed for', n.dedup_key, err.message);
    }
  }

  let emailResult = { sent: false, reason: 'no-new-notifications' };
  if (newlyCreated.length > 0) {
    const subject =
      newlyCreated.length === 1
        ? `[Invex] ${newlyCreated[0].title}`
        : `[Invex] ${newlyCreated.length} new inventory alerts`;
    const { html, text } = composeDigest(newlyCreated);
    emailResult = await sendEmail({ subject, html, text });
    if (emailResult.sent) {
      await notificationModel.markEmailSent(newlyCreated.map((r) => r.id));
    }
  }

  if (!silent) {
    console.log(
      `[notifications] scan complete — ${findings.length} active issue(s), ` +
      `${newlyCreated.length} new, email: ${emailResult.sent ? 'sent' : emailResult.reason}`
    );
  }
  return { findings, newlyCreated, emailResult };
}

let intervalHandle = null;
function start(intervalMs = 15 * 60 * 1000) {
  if (intervalHandle) return;
  // First scan after a short delay so the server has fully booted.
  setTimeout(() => {
    runScan().catch((err) => console.error('[notifications] initial scan failed:', err));
  }, 5000);
  intervalHandle = setInterval(() => {
    runScan().catch((err) => console.error('[notifications] periodic scan failed:', err));
  }, intervalMs);
  console.log(`[notifications] scanner started (every ${Math.round(intervalMs / 60000)} min)`);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { runScan, start, stop };
