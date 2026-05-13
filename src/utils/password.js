import bcrypt from 'bcrypt';

/**
 * Hash a plain text password using bcrypt with 10 salt rounds
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {Error} If password is invalid or hashing fails
 */
export async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }

  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  return hashedPassword;
}

/**
 * Compare a plain text password with a hashed password
 * @param {string} password - Plain text password to verify
 * @param {string} hash - Hashed password to compare against
 * @returns {Promise<boolean>} True if password matches hash, false otherwise
 * @throws {Error} If password or hash is invalid
 */
export async function comparePassword(password, hash) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  if (!hash || typeof hash !== 'string') {
    throw new Error('Hash must be a non-empty string');
  }

  const isMatch = await bcrypt.compare(password, hash);
  return isMatch;
}
