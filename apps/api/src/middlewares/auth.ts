import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { ACCESS_COOKIE } from '../security/cookies.js';
import { verifyAccessToken } from '../security/token-service.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../types.js';

export function requireAuth(db: PrismaClient) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
      if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Autenticação necessária.');
      const claims = await verifyAccessToken(token);
      const session = await db.session.findUnique({ where: { id: claims.sessionId } });
      const idleExpired =
        !session || session.lastSeenAt.getTime() + env.SESSION_IDLE_TTL_SECONDS * 1000 <= Date.now();
      if (
        !session ||
        session.userId !== claims.userId ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        idleExpired
      ) {
        throw new AppError(401, 'SESSION_EXPIRED', 'Sessão expirada.');
      }
      (req as AuthenticatedRequest).auth = {
        userId: claims.userId,
        sessionId: claims.sessionId,
      };
      void db.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}
