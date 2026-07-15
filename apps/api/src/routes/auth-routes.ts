import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginRequestSchema } from '@nexstream/shared';
import type { AuthService } from '../application/auth-service.js';
import type { PrismaClient } from '@prisma/client';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../security/cookies.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireCsrf } from '../middlewares/csrf.js';
import type { AuthenticatedRequest } from '../types.js';
import { AppError } from '../utils/errors.js';

export function authRoutes(authService: AuthService, db: PrismaClient): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Tente novamente mais tarde.' } },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const input = loginRequestSchema.parse(req.body);
    const result = await authService.login(input, res.locals.correlationId as string | undefined);
    setAuthCookies(res, result);
    res.status(200).json({ user: result.user });
  });

  router.post('/refresh', loginLimiter, requireCsrf, async (req, res) => {
    const rawToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!rawToken) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Sessão inválida.');
    const result = await authService.refresh(rawToken);
    setAuthCookies(res, result);
    res.status(200).json({ user: result.user });
  });

  router.get('/me', requireAuth(db), async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, displayName: true },
    });
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Sessão inválida.');
    res.json({ user });
  });

  router.post('/logout', requireAuth(db), requireCsrf, async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    await authService.logout(auth.sessionId);
    clearAuthCookies(res);
    res.status(204).send();
  });

  return router;
}
