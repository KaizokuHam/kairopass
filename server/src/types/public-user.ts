import type { UserRecord } from '../models/User.model.js';

/** Public DTOs are explicit allowlists, separate from persistence and future Zod input schemas. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRecord['role'];
  createdAt: string;
  updatedAt: string;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}
