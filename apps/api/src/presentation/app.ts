import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { correlationId } from '../middlewares/correlation.js';
import { validateOrigin } from '../middlewares/origin.js';
import { errorHandler, notFound } from '../middlewares/error-handler.js';
import { prisma } from '../infrastructure/persistence/prisma.js';
import { MemoryCache } from '../infrastructure/cache/memory-cache.js';
import { AesGcmCodec } from '../security/aes-gcm.js';
import { OpaqueIdService } from '../security/opaque-id.js';
import { XtreamClient } from '../infrastructure/http/xtream-client.js';
import { CredentialService } from '../services/credential-service.js';
import { AuthService } from '../application/auth-service.js';
import { PlaybackService } from '../services/playback-service.js';
import { authRoutes } from '../routes/auth-routes.js';
import { catalogRoutes } from '../routes/catalog-routes.js';
import { playbackRoutes } from '../routes/playback-routes.js';
import { libraryRoutes } from '../routes/library-routes.js';
import { ImageProxyService } from '../services/image-proxy-service.js';
import { imageRoutes } from '../routes/image-routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUSTED_PROXY_HOPS);

  const cache = new MemoryCache(2_000);
  const credentialCodec = new AesGcmCodec(env.CREDENTIAL_ENCRYPTION_KEY_BASE64);
  const opaqueCodec = new AesGcmCodec(env.OPAQUE_ID_ENCRYPTION_KEY_BASE64);
  const resourceCodec = new AesGcmCodec(env.RESOURCE_TOKEN_ENCRYPTION_KEY_BASE64);
  const imageCodec = new AesGcmCodec(env.IMAGE_TOKEN_ENCRYPTION_KEY_BASE64);
  const opaqueIds = new OpaqueIdService(opaqueCodec);
  const xtream = new XtreamClient(opaqueIds, cache);
  const credentials = new CredentialService(prisma, cache, credentialCodec);
  const auth = new AuthService(prisma, xtream, credentials, credentialCodec);
  const playback = new PlaybackService(prisma, credentials, opaqueIds, resourceCodec, xtream);
  const images = new ImageProxyService(imageCodec);

  app.use(correlationId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const expressResponse = res as typeof res & {
          locals?: {
            correlationId?: unknown;
          };
        };

        return String(
          expressResponse.locals?.correlationId ?? '',
        );
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type', 'x-csrf-token', 'x-correlation-id', 'range'],
      exposedHeaders: ['content-range', 'accept-ranges', 'x-correlation-id'],
    }),
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use(validateOrigin);
  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }),
  );

  app.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/auth', authRoutes(auth, prisma));
  app.use('/api/v1/catalog', catalogRoutes(prisma, xtream, credentials, images));
  app.use('/api/v1/playback', playbackRoutes(prisma, playback));
  app.use('/api/v1/library', libraryRoutes(prisma, opaqueIds));
  app.use('/api/v1/images', imageRoutes(prisma, images));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
