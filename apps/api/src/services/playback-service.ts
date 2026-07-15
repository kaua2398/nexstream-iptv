import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { CredentialService } from './credential-service.js';
import type { OpaqueIdService } from '../security/opaque-id.js';
import type { AesGcmCodec } from '../security/aes-gcm.js';
import type { XtreamClient } from '../infrastructure/http/xtream-client.js';
import { env } from '../config/env.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';
import { validatePublicHttpUrl } from '../security/ssrf.js';
import { axiosGetWithValidatedRedirects } from '../security/safe-http.js';

const playbackRequestSchema = z
  .object({ mediaId: z.string().min(20).max(4096) })
  .strict();

interface ResourcePayload {
  userId: string;
  sessionId: string;
  playbackTokenId: string;
  url: string;
  expiresAt: number;
}

export class PlaybackService {
  private readonly activeStreams = new Map<string, number>();

  constructor(
    private readonly db: PrismaClient,
    private readonly credentials: CredentialService,
    private readonly opaqueIds: OpaqueIdService,
    private readonly resourceCodec: AesGcmCodec,
    private readonly xtream: XtreamClient,
  ) {}

  async issue(
    userId: string,
    sessionId: string,
    input: unknown,
  ): Promise<{
    url: string;
    expiresIn: number;
    mode: 'hls' | 'file';
  }> {
    const { mediaId } = playbackRequestSchema.parse(input);
    const media = this.opaqueIds.parse(mediaId, userId);
    if (!['live', 'movie', 'episode'].includes(media.type)) {
      throw new AppError(400, 'NOT_PLAYABLE', 'Conteúdo não reproduzível.');
    }
    const normalizedExtension = media.extension
      ?.trim()
      .toLowerCase();

    const mode: 'hls' | 'file' =
      media.type === 'live' ||
      normalizedExtension === 'm3u8'
        ? 'hls'
        : 'file';

    const rawToken = randomToken(40);
    await this.db.playbackToken.create({
      data: {
        sessionId,
        tokenHash: sha256(rawToken),
        mediaId,
        mediaType: media.type,
        expiresAt: new Date(Date.now() + env.PLAYBACK_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return {
      url: `/api/v1/playback/stream/${encodeURIComponent(rawToken)}`,
      expiresIn: env.PLAYBACK_TOKEN_TTL_SECONDS,
      mode,
    };
  }

  private async resolvePlayback(rawToken: string, userId: string, sessionId: string) {
    const stored = await this.db.playbackToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { session: true },
    });
    if (
      !stored ||
      stored.sessionId !== sessionId ||
      stored.session.userId !== userId ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      stored.session.revokedAt
    ) {
      throw new AppError(401, 'INVALID_PLAYBACK_TOKEN', 'Token de reprodução inválido.');
    }
    return stored;
  }

  private startStream(sessionId: string): () => void {
    const current = this.activeStreams.get(sessionId) ?? 0;
    if (current >= env.MAX_CONCURRENT_STREAMS) {
      throw new AppError(429, 'STREAM_LIMIT_REACHED', 'Limite de reproduções simultâneas atingido.');
    }
    this.activeStreams.set(sessionId, current + 1);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      const next = Math.max(0, (this.activeStreams.get(sessionId) ?? 1) - 1);
      if (next === 0) this.activeStreams.delete(sessionId);
      else this.activeStreams.set(sessionId, next);
    };
  }

  async stream(
    req: Request,
    res: Response,
    auth: { userId: string; sessionId: string },
    rawToken: string,
  ): Promise<void> {
    const release = this.startStream(auth.sessionId);
    res.once('close', release);
    res.once('finish', release);

    const stored = await this.resolvePlayback(rawToken, auth.userId, auth.sessionId);
    const media = this.opaqueIds.parse(stored.mediaId, auth.userId);
    const credentials = await this.credentials.getForSession(auth.sessionId, auth.userId);
    const upstream = await this.xtream.streamUrl(credentials, {
      type: media.type as 'live' | 'movie' | 'episode',
      providerId: media.providerId,
      ...(media.extension ? { extension: media.extension } : {}),
    });

    const looksLikeHls = upstream.pathname.toLowerCase().endsWith('.m3u8');
    if (looksLikeHls) {
      await this.proxyManifest(res, upstream, stored.id, rawToken, auth);
      return;
    }
    await this.proxyBinary(req, res, upstream);
  }

  private resourceToken(url: URL, playbackTokenId: string, auth: { userId: string; sessionId: string }): string {
    const payload: ResourcePayload = {
      userId: auth.userId,
      sessionId: auth.sessionId,
      playbackTokenId,
      url: url.toString(),
      expiresAt: Date.now() + env.PLAYBACK_TOKEN_TTL_SECONDS * 1000,
    };
    return this.resourceCodec.encrypt(payload, 'nexstream-resource');
  }

  private rewriteManifest(
    manifest: string,
    upstream: URL,
    playbackTokenId: string,
    rawToken: string,
    auth: { userId: string; sessionId: string },
  ): string {
    const rewrite = (value: string): string => {
      const resolved = new URL(value, upstream);
      const resource = this.resourceToken(resolved, playbackTokenId, auth);
      return `/api/v1/playback/segment?playback=${encodeURIComponent(rawToken)}&resource=${encodeURIComponent(resource)}`;
    };

    return manifest
      .split(/\r?\n/)
      .map((line) => {
        if (!line) return line;
        if (!line.startsWith('#')) return rewrite(line.trim());
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${rewrite(uri)}"`);
      })
      .join('\n');
  }

  private async proxyManifest(
    res: Response,
    upstream: URL,
    playbackTokenId: string,
    rawToken: string,
    auth: {
      userId: string;
      sessionId: string;
    },
  ): Promise<void> {
    const {
      response,
      finalUrl,
    } =
      await axiosGetWithValidatedRedirects<string>(
        upstream,
        {
          responseType: 'text',
          timeout: 12_000,
          maxContentLength:
            2 * 1024 * 1024,
          headers: {
            'User-Agent':
              'NexStream/0.1',
            Accept:
              'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
          },
        },
      );

    res.setHeader(
      'content-type',
      'application/vnd.apple.mpegurl',
    );

    res.setHeader(
      'cache-control',
      'private, no-store',
    );

    /*
     * Usa a URL final porque segmentos relativos precisam
     * ser resolvidos em relação ao destino após o redirect.
     */
    res.send(
      this.rewriteManifest(
        response.data,
        finalUrl,
        playbackTokenId,
        rawToken,
        auth,
      ),
    );
  }

  async segment(
    req: Request,
    res: Response,
    auth: { userId: string; sessionId: string },
    rawPlaybackToken: string,
    rawResourceToken: string,
  ): Promise<void> {
    const stored = await this.resolvePlayback(rawPlaybackToken, auth.userId, auth.sessionId);
    const resource = this.resourceCodec.decrypt<ResourcePayload>(
      rawResourceToken,
      'nexstream-resource',
    );
    if (
      resource.userId !== auth.userId ||
      resource.sessionId !== auth.sessionId ||
      resource.playbackTokenId !== stored.id ||
      resource.expiresAt <= Date.now()
    ) {
      throw new AppError(401, 'INVALID_RESOURCE_TOKEN', 'Recurso de reprodução inválido.');
    }
    const target = await validatePublicHttpUrl(resource.url);
    if (target.url.pathname.toLowerCase().endsWith('.m3u8')) {
      await this.proxyManifest(res, target.url, stored.id, rawPlaybackToken, auth);
      return;
    }
    await this.proxyBinary(req, res, target.url);
  }

  private async proxyBinary(
    req: Request,
    res: Response,
    upstream: URL,
  ): Promise<void> {
    const range = req.header('range');

    if (
      range &&
      !/^bytes=\d*-\d*$/.test(range)
    ) {
      throw new AppError(
        416,
        'INVALID_RANGE',
        'Intervalo de mídia inválido.',
      );
    }

    const { response } =
      await axiosGetWithValidatedRedirects<NodeJS.ReadableStream>(
        upstream,
        {
          responseType: 'stream',
          timeout: 30_000,
          headers: {
            'User-Agent':
              'NexStream/0.1',
            Accept: '*/*',
            ...(range
              ? { Range: range }
              : {}),
          },
        },
      );

    res.status(response.status);

    for (
      const header of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
      ]
    ) {
      const value =
        response.headers[header];

      if (value) {
        res.setHeader(
          header,
          value,
        );
      }
    }

    res.setHeader(
      'cache-control',
      'private, no-store',
    );

    response.data.once(
      'error',
      () => {
        res.destroy();
      },
    );

    req.once(
      'close',
      () => {
        if (!res.writableEnded) {
          const stream = response.data as
            NodeJS.ReadableStream & {
              destroy?: () => void;
            };

          stream.destroy?.();
        }
      },
    );

    response.data.pipe(res);
  }
}
