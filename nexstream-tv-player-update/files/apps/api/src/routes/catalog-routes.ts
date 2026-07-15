import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { XtreamClient } from '../infrastructure/http/xtream-client.js';
import type { CredentialService } from '../services/credential-service.js';
import { requireAuth } from '../middlewares/auth.js';
import type { AuthenticatedRequest } from '../types.js';
import type { ImageProxyService } from '../services/image-proxy-service.js';

const browseQuerySchema = z.object({
  type: z.enum(['live', 'movie', 'series']),
  categoryId: z.string().min(1).max(4096).optional(),
  query: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(12).max(60).default(36),
});

export function catalogRoutes(
  db: PrismaClient,
  xtream: XtreamClient,
  credentials: CredentialService,
  images: ImageProxyService,
): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get('/home', async (req, res) => {
    const auth = (req as unknown as AuthenticatedRequest).auth;
    const providerCredentials = await credentials.getForSession(auth.sessionId, auth.userId);
    const source = await xtream.homeCatalog(auth.userId, providerCredentials);
    const mapImages = <T extends { imageUrl: string | null; backdropUrl: string | null }>(item: T): T => ({
      ...item,
      imageUrl: images.issue(item.imageUrl, auth.userId),
      backdropUrl: images.issue(item.backdropUrl, auth.userId),
    });
    const catalog = {
      ...source,
      live: source.live.map(mapImages),
      movies: source.movies.map(mapImages),
      series: source.series.map(mapImages),
    };
    res.setHeader('cache-control', 'private, max-age=30');
    res.json(catalog);
  });

  router.get('/browse', async (req, res) => {
    const auth = (req as unknown as AuthenticatedRequest).auth;
    const input = browseQuerySchema.parse(req.query);
    const providerCredentials = await credentials.getForSession(auth.sessionId, auth.userId);
    const source = await xtream.browseCatalog(auth.userId, providerCredentials, {
      type: input.type,
      ...(input.categoryId
        ? { categoryId: input.categoryId }
        : {}),
      page: input.page,
      pageSize: input.limit,
      query: input.query,
    });

    res.setHeader('cache-control', 'private, max-age=30');
    res.json({
      ...source,
      recentItems: source.recentItems.map((item) => ({
        ...item,
        imageUrl: images.issue(item.imageUrl, auth.userId),
        backdropUrl: images.issue(item.backdropUrl, auth.userId),
      })),
      items: source.items.map((item) => ({
        ...item,
        imageUrl: images.issue(item.imageUrl, auth.userId),
        backdropUrl: images.issue(item.backdropUrl, auth.userId),
      })),
    });
  });

  router.get('/series/:seriesId', async (req, res) => {
    const auth = (req as unknown as AuthenticatedRequest).auth;
    const rawSeriesId = req.params.seriesId;
    const seriesId = decodeURIComponent(
      Array.isArray(rawSeriesId) ? (rawSeriesId[0] ?? '') : (rawSeriesId ?? ''),
    );
    const providerCredentials = await credentials.getForSession(
      auth.sessionId,
      auth.userId,
    );
    const source = await xtream.seriesDetails(
      auth.userId,
      providerCredentials,
      seriesId,
    );

    res.setHeader('cache-control', 'private, max-age=30');
    res.json({
      ...source,
      coverUrl: images.issue(source.coverUrl, auth.userId),
      backdropUrl: images.issue(source.backdropUrl, auth.userId),
      seasons: source.seasons.map((season) => ({
        ...season,
        coverUrl: images.issue(season.coverUrl, auth.userId),
        episodes: season.episodes.map((episode) => ({
          ...episode,
          imageUrl: images.issue(episode.imageUrl, auth.userId),
        })),
      })),
    });
  });

  return router;
}