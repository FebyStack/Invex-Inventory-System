const bcrypt = require('bcrypt');
const { query, pool } = require('./src/config/db');

const [username, newPassword] = process.argv.slice(2);

const main = async () => {
  if (!username || !newPassword) {
    console.error('Usage: node fix-password.js <username> <new-password>');
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
