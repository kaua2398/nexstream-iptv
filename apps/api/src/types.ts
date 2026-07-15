import type { Request } from 'express';

export interface AuthContext {
  userId: string;
  sessionId: string;
}

export type AuthenticatedRequest = Request & { auth: AuthContext };
