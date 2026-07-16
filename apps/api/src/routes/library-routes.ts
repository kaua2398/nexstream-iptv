import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middlewares/auth.js';
import { requireCsrf } from '../middlewares/csrf.js';
import type { AuthenticatedRequest } from '../types.js';
import type { OpaqueIdService } from '../security/opaque-id.js';

const libraryImageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      /^https?:\/\//i.test(value) ||
      value.startsWith('/'),
    'Imagem inválida.',
  )
  .nullable()
  .optional();
const favoriteSchema = z
  .object({
    mediaId: z.string().min(20).max(4096),
    mediaType: z.enum(['live', 'movie', 'series', 'episode']),
    title: z.string().trim().min(1).max(300),
    imageUrl: libraryImageUrlSchema,
  })
  .strict();

const historySchema = favoriteSchema
  .omit({ mediaType: true })
  .extend({
    mediaType: z.enum(['live', 'movie', 'episode']),
    positionSeconds: z.number().int().min(0).max(864_000),
    durationSeconds: z.number().int().min(0).max(864_000),
    watchedSeconds: z.number().int().min(0).max(100_000_000),
  })
  .strict();

export function libraryRoutes(db: PrismaClient, opaqueIds: OpaqueIdService): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get('/favorites', async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const items = await db.favorite.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  });

  router.put('/favorites', requireCsrf, async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const input = favoriteSchema.parse(req.body);
    opaqueIds.parse(input.mediaId, auth.userId);
    const favorite = await db.favorite.upsert({
      where: { userId_mediaId: { userId: auth.userId, mediaId: input.mediaId } },
      update: { title: input.title, imageUrl: input.imageUrl ?? null, mediaType: input.mediaType },
      create: { userId: auth.userId, ...input, imageUrl: input.imageUrl ?? null },
    });
    res.json({ favorite });
  });

  router.delete('/favorites/:mediaId', requireCsrf, async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const rawMediaId = req.params.mediaId;
    const mediaId = decodeURIComponent(
      Array.isArray(rawMediaId)
        ? (rawMediaId[0] ?? '')
        : (rawMediaId ?? ''),
    );
    opaqueIds.parse(mediaId, auth.userId);
    await db.favorite.deleteMany({ where: { userId: auth.userId, mediaId } });
    res.status(204).send();
  });

  router.get('/history', async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const items = await db.watchHistory.findMany({
      where: { userId: auth.userId },
      orderBy: { lastWatchedAt: 'desc' },
      take: 100,
    });
    res.json({ items });
  });

  router.put('/history', requireCsrf, async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    const input = historySchema.parse(req.body);
    opaqueIds.parse(input.mediaId, auth.userId);
    const completed = input.durationSeconds > 0 && input.positionSeconds / input.durationSeconds >= 0.9;
    const item = await db.watchHistory.upsert({
      where: { userId_mediaId: { userId: auth.userId, mediaId: input.mediaId } },
      update: {
        ...input,
        imageUrl: input.imageUrl ?? null,
        completed,
        lastWatchedAt: new Date(),
      },
      create: {
        userId: auth.userId,
        ...input,
        imageUrl: input.imageUrl ?? null,
        completed,
      },
    });
    res.json({ item });
  });

  router.delete('/history', requireCsrf, async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
    await db.watchHistory.deleteMany({ where: { userId: auth.userId } });
    res.status(204).send();
  });

  return router;
}
