import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { ImageProxyService } from '../services/image-proxy-service.js';
import { requireAuth } from '../middlewares/auth.js';
import type { AuthenticatedRequest } from '../types.js';
import { AppError } from '../utils/errors.js';

export function imageRoutes(db: PrismaClient, images: ImageProxyService): Router {
  const router = Router();
  router.use(requireAuth(db));
  router.get('/:token', async (req, res) => {
    const token = req.params.token;
    if (!token) throw new AppError(404, 'IMAGE_NOT_FOUND', 'Imagem não encontrada.');
    const auth = (req as unknown as AuthenticatedRequest).auth;
    await images.proxy(token, auth.userId, res);
  });
  return router;
}
