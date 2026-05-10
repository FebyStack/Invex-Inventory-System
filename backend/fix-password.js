// Admin password-reset CLI. Requires the same password policy the API enforces.
// Refuses to run in production unless ALLOW_PROD_RESET=1 is explicitly set, so
// this script can't be triggered accidentally on a live deploy.
require('dotenv').config({ path: __dirname + '/.env' });
const bcrypt = require('bcrypt');
const { query, pool } = require('./src/config/db');
const { validatePassword } = require('./src/utils/passwordPolicy');

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_RESET !== '1') {
  console.error('Refusing to run in production. Set ALLOW_PROD_RESET=1 to override.');
  process.exit(1);
}

const [username, newPassword] = process.argv.slice(2);

const main = async () => {
  if (!username || !newPassword) {
    console.error('Usage: node fix-password.js <username> <new-password>');
    process.exitCode = 1;
    return;
  }

  const pwCheck = validatePassword(newPassword);
  if (!pwCheck.ok) {
    console.error(pwCheck.message);
    process.exitCode = 1;
    return;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const result = await query(
    `UPDATE invex.users
     SET password = $2
     WHERE username = $1 AND is_deleted = FALSE
     RETURNING id, username`,
    [username, hashedPassword]
  );

  if (result.rowCount === 0) {
    console.error(`No active user found for username "${username}".`);
    process.exitCode = 1;
    return;
  }

  console.log(`Password updated for user "${result.rows[0].username}" (id: ${result.rows[0].id}).`);
};

main()
  .catch((error) => {
    console.error('Failed to update password:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
