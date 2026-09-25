import bcrypt from 'bcryptjs';

export const PASSWORD_COST = 12;

// Precomputed once at cost 12. Missing and disabled users compare against this
// value so every credential failure follows the same bcrypt code path.
const DUMMY_PASSWORD_HASH =
  '$2b$12$TpE9wq4FVm7W5BKKOeuNjeY4Es3HYY4dFfZ.tJ4dDHZsvXizWdeHm';

export async function hashPassword(password: string): Promise<string> {
  if (bcrypt.truncates(password)) {
    throw new RangeError('Password must be at most 72 UTF-8 bytes');
  }
  return bcrypt.hash(password, PASSWORD_COST);
}

/**
 * Verifies a password when a real hash is present. A nullish hash still performs
 * one bcrypt comparison but can never authenticate.
 */
export async function verifyPassword(
  password: string,
  passwordHash?: string | null,
): Promise<boolean> {
  const hasRealHash = typeof passwordHash === 'string' && passwordHash.length > 0;
  const isTooLong = bcrypt.truncates(password);
  const matches = await bcrypt.compare(
    password,
    hasRealHash && !isTooLong ? passwordHash : DUMMY_PASSWORD_HASH,
  );
  return hasRealHash && !isTooLong && matches;
}
