import mongoose, { Types } from 'mongoose';
import { AuthSession } from '../../models/AuthSession.model.js';
import { User, USER_ROLES } from '../../models/User.model.js';
import { ApiError } from '../../lib/api-error.js';
import { toPublicUser } from '../../types/public-user.js';
import type { AuthConfig } from '../../config/auth.js';
import type { AuthContext } from './auth.types.js';
import type { LoginInput, RegistrationInput } from './auth.validation.js';
import { hashPassword, verifyPassword } from './auth.passwords.js';
import { createSessionMaterial, hashSessionId, verifySessionToken } from './auth.tokens.js';

function duplicateEmail(error: unknown): boolean {
  return error instanceof mongoose.mongo.MongoServerError && error.code === 11000 && error.keyPattern?.email === 1;
}

export async function register(input: RegistrationInput, config: AuthConfig) {
  if (await User.exists({ email: input.email })) {
    throw new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
  }
  const passwordHash = await hashPassword(input.password);
  const userId = new Types.ObjectId();
  const material = await createSessionMaterial(userId.toHexString(), config);
  try {
    // A session-creation failure must not leave a half-completed registration.
    const user = await mongoose.connection.transaction(async (session) => {
      const created = new User({ _id: userId, name: input.name, email: input.email, role: input.role, passwordHash });
      await created.save({ session });
      await AuthSession.create([{
        userId, jtiHash: material.jtiHash, expiresAt: material.expiresAt
      }], { session });
      return created;
    });
    return { user: toPublicUser(user), ...material };
  } catch (error) {
    if (duplicateEmail(error)) throw new ApiError(409, 'EMAIL_IN_USE', 'An account with this email already exists.');
    throw error;
  }
}

export async function login(input: LoginInput, config: AuthConfig) {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const validPassword = await verifyPassword(input.password, user?.passwordHash);
  if (!validPassword || !user || !USER_ROLES.includes(user.role)) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  const material = await createSessionMaterial(user._id.toHexString(), config);
  await AuthSession.create({ userId: user._id, jtiHash: material.jtiHash, expiresAt: material.expiresAt });
  return { user: toPublicUser(user), ...material };
}

export async function authenticate(token: string | undefined, config: AuthConfig): Promise<AuthContext> {
  const claims = await verifySessionToken(token, config);
  if (!claims) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  const session = await AuthSession.findOne({
    jtiHash: hashSessionId(claims.jti), userId: claims.sub,
    revokedAt: null, expiresAt: { $gt: new Date() }
  });
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  const user = await User.findById(claims.sub);
  if (!user || !USER_ROLES.includes(user.role)) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return { user: toPublicUser(user), sessionId: session._id.toHexString() };
}

export async function logout(token: string | undefined, config: AuthConfig): Promise<void> {
  const claims = await verifySessionToken(token, config);
  if (!claims) return; // Already logged out or expired: still clear the browser cookie.
  await AuthSession.updateOne({
    jtiHash: hashSessionId(claims.jti), userId: claims.sub, revokedAt: null
  }, { $set: { revokedAt: new Date() } }, { runValidators: true });
}
