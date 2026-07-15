import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { XtreamClient } from '../infrastructure/http/xtream-client.js';
import type { CredentialService } from '../services/credential-service.js';
import { requireAuth } from '../middlewares/auth.js';
import type { AuthenticatedRequest } from '../types.js';
import type { ImageProxyService } from '../services/image-proxy-service.js';

export function catalogRoutes(
  db: PrismaClient,
  xtream: XtreamClient,
  credentials: CredentialService,
  images: ImageProxyService,
): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get('/home', async (req, res) => {
    const auth = (req as AuthenticatedRequest).auth;
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

  return router;
}
