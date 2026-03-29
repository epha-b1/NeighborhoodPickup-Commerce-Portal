import type { RoleName } from '../auth/roles';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: number;
        username: string;
        roles: RoleName[];
        tokenHash: string;
      };
    }
  }
}

export {};