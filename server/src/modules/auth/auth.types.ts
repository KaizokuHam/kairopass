import type { PublicUser } from '../../types/public-user.js';

export interface AuthContext {
  readonly user: PublicUser;
  readonly sessionId: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}
