import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import type { PlaybackService } from '../services/playback-service.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireCsrf } from '../middlewares/csrf.js';
import type { AuthenticatedRequest } from '../types.js';
import { AppError } from '../utils/errors.js';

export function playbackRoutes(db: PrismaClient, playback: PlaybackService): Router {
  const router = Router();
  const tokenLimiter = rateLimit({ windowMs: 60_000, limit: 30, legacyHeaders: false });
  router.use(requireAuth(db));

  router.post('/token', tokenLimiter, requireCsrf, async (req, res) => {
    const auth = (req as unknown as AuthenticatedRequest).auth;
    res.json(await playback.issue(auth.userId, auth.sessionId, req.body));
  });

  router.get('/stream/:token', async (req, res) => {
    const auth = (req as unknown as AuthenticatedRequest).auth;
    const token = req.params.token;
    if (!token) throw new AppError(400, 'TOKEN_REQUIRED', 'Token obrigatório.');
    await playback.stream(req, res, auth, token);
  });

  router.get('/segment', async (req, res) => {
    const auth = (req as unknown as AuthenticatedRequest).auth;
    const playbackToken = typeof req.query.playback === 'string' ? req.query.playback : '';
    const resourceToken = typeof req.query.resource === 'string' ? req.query.resource : '';
    if (!playbackToken || !resourceToken) {
      throw new AppError(400, 'RESOURCE_TOKEN_REQUIRED', 'Recurso inválido.');
    }
    await playback.segment(req, res, auth, playbackToken, resourceToken);
  });

  return router;
}
