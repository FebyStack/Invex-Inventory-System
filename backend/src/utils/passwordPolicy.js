/**
 * Password policy: ≥12 chars, at least one lowercase, one uppercase, one digit.
 * A symbol is recommended but not required, to keep the rule reachable for
 * users who don't typically use them.
 *
 * Returns { ok: boolean, message?: string }.
 */
const MIN_LENGTH = 12;

const validatePassword = (password) => {
  if (typeof password !== 'string') {
    return { ok: false, message: 'Password must be a string.' };
  }
  if (password.length < MIN_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one number.' };
  }
  return { ok: true };
};

module.exports = { validatePassword, MIN_LENGTH };
