import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';

const options = { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 } as const;
let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

/** Unknown users still pay the cost of Argon2 verification; no timing-based early return. */
export async function verifyPassword(password: string, passwordHash?: string): Promise<boolean> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  const fallback = await dummyHash;
  try {
    const matches = await verify(passwordHash ?? fallback, password);
    return passwordHash !== undefined && matches;
  } catch {
    // Invalid stored hashes do not reveal parser errors or become a cheaper public failure.
    await verify(fallback, password);
    return false;
  }
}
