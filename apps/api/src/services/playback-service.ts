import { once } from 'node:events';
import type { Readable } from 'node:stream';
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

  private async resolvePlayback(
    rawToken: string,
  ) {
    const stored =
      await this.db.playbackToken.findUnique({
        where: {
          tokenHash: sha256(rawToken),
        },
        include: {
          session: true,
        },
      });

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt <= new Date() ||
      stored.session.revokedAt
    ) {
      throw new AppError(
        401,
        'INVALID_PLAYBACK_TOKEN',
        'Token de reprodução inválido.',
      );
    }

    return stored;
  }

  async stream(
    req: Request,
    res: Response,
    rawToken: string,
  ): Promise<void> {
    const stored =
      await this.resolvePlayback(rawToken);

    const auth = {
      userId: stored.session.userId,
      sessionId: stored.sessionId,
    };

    const media = this.opaqueIds.parse(
      stored.mediaId,
      auth.userId,
    );

    const credentials =
      await this.credentials.getForSession(
        auth.sessionId,
        auth.userId,
      );

    const upstream =
      await this.xtream.streamUrl(
        credentials,
        {
          type:
            media.type as
              | 'live'
              | 'movie'
              | 'episode',
          providerId: media.providerId,
          ...(media.extension
            ? {
                extension:
                  media.extension,
              }
            : {}),
        },
      );

    const looksLikeHls =
      upstream.pathname
        .toLowerCase()
        .endsWith('.m3u8');

    if (looksLikeHls) {
      await this.proxyManifest(
        res,
        upstream,
        stored.id,
        rawToken,
        auth,
      );

      return;
    }

    await this.proxyBinary(
      req,
      res,
      upstream,
      {
        forceRange:
          media.type === 'movie' ||
          media.type === 'episode',
        cacheSeconds:
          media.type === 'live'
            ? 5
            : 120,
      },
    );
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
          timeout: 20_000,
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
    rawPlaybackToken: string,
    rawResourceToken: string,
  ): Promise<void> {
    const stored =
      await this.resolvePlayback(
        rawPlaybackToken,
      );

    const auth = {
      userId: stored.session.userId,
      sessionId: stored.sessionId,
    };

    const resource =
      this.resourceCodec.decrypt<ResourcePayload>(
        rawResourceToken,
        'nexstream-resource',
      );

    if (
      resource.userId !== auth.userId ||
      resource.sessionId !== auth.sessionId ||
      resource.playbackTokenId !== stored.id ||
      resource.expiresAt <= Date.now()
    ) {
      throw new AppError(
        401,
        'INVALID_RESOURCE_TOKEN',
        'Recurso de reprodução inválido.',
      );
    }

    const target =
      await validatePublicHttpUrl(
        resource.url,
      );

    if (
      target.url.pathname
        .toLowerCase()
        .endsWith('.m3u8')
    ) {
      await this.proxyManifest(
        res,
        target.url,
        stored.id,
        rawPlaybackToken,
        auth,
      );

      return;
    }

    await this.proxyBinary(
      req,
      res,
      target.url,
      {
        forceRange: false,
        cacheSeconds: 30,
      },
    );
  }

  private async proxyBinary(
    req: Request,
    res: Response,
    upstream: URL,
    options: {
      forceRange: boolean;
      cacheSeconds: number;
    },
  ): Promise<void> {
    const maxChunkBytes =
      64 * 1024 * 1024;

    const requestedRange =
      req.header('range');

    const ifRange =
      req.header('if-range');

    if (
      requestedRange &&
      !/^bytes=\d*-\d*$/.test(
        requestedRange,
      )
    ) {
      throw new AppError(
        416,
        'INVALID_RANGE',
        'Intervalo de mídia inválido.',
      );
    }

    let requestedStart:
      | number
      | null = null;

    let requestedEnd:
      | number
      | null = null;

    let upstreamRange =
      requestedRange;

    const rangeMatch =
      requestedRange
        ? /^bytes=(\d*)-(\d*)$/.exec(
            requestedRange,
          )
        : null;

    if (rangeMatch?.[1]) {
      requestedStart =
        Number(rangeMatch[1]);

      requestedEnd =
        rangeMatch[2]
          ? Number(rangeMatch[2])
          : null;

      if (
        !Number.isSafeInteger(
          requestedStart,
        ) ||
        requestedStart < 0 ||
        (
          requestedEnd != null &&
          (
            !Number.isSafeInteger(
              requestedEnd,
            ) ||
            requestedEnd <
              requestedStart
          )
        )
      ) {
        throw new AppError(
          416,
          'INVALID_RANGE',
          'Intervalo de mídia inválido.',
        );
      }

      const cappedEnd =
        Math.min(
          requestedEnd ??
            Number.MAX_SAFE_INTEGER,
          requestedStart +
            maxChunkBytes -
            1,
        );

      upstreamRange =
        `bytes=${requestedStart}-${cappedEnd}`;
    } else if (
      rangeMatch?.[2]
    ) {
      const suffixLength =
        Number(rangeMatch[2]);

      if (
        !Number.isSafeInteger(
          suffixLength,
        ) ||
        suffixLength <= 0
      ) {
        throw new AppError(
          416,
          'INVALID_RANGE',
          'Intervalo de mídia inválido.',
        );
      }

      upstreamRange =
        `bytes=-${Math.min(
          suffixLength,
          maxChunkBytes,
        )}`;
    } else if (
      options.forceRange
    ) {
      requestedStart = 0;
      requestedEnd =
        maxChunkBytes - 1;

      upstreamRange =
        `bytes=0-${requestedEnd}`;
    }

    req.setTimeout(0);
    res.setTimeout(0);

    const {
      response,
    } =
      await axiosGetWithValidatedRedirects<Readable>(
        upstream,
        {
          responseType: 'stream',
          timeout:
            options.forceRange
              ? 0
              : 30_000,
          maxBodyLength:
            Number.POSITIVE_INFINITY,
          maxContentLength:
            Number.POSITIVE_INFINITY,
          decompress: false,
          headers: {
            'User-Agent':
              'NexStream/0.1',
            Accept: '*/*',
            'Accept-Encoding':
              'identity',
            Connection:
              'keep-alive',
            ...(upstreamRange
              ? {
                  Range:
                    upstreamRange,
                }
              : {}),
            ...(ifRange
              ? {
                  'If-Range':
                    ifRange,
                }
              : {}),
          },
        },
      );

    const contentRangeHeader =
      typeof response.headers[
        'content-range'
      ] === 'string'
        ? response.headers[
            'content-range'
          ]
        : null;

    const contentRangeMatch =
      contentRangeHeader
        ? /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(
            contentRangeHeader,
          )
        : null;

    const upstreamLength =
      Number(
        response.headers[
          'content-length'
        ],
      );

    let outputStatus =
      response.status;

    let outputStart:
      | number
      | null =
        contentRangeMatch
          ? Number(
              contentRangeMatch[1],
            )
          : null;

    let outputEnd:
      | number
      | null =
        contentRangeMatch
          ? Number(
              contentRangeMatch[2],
            )
          : null;

    let outputTotal:
      | number
      | null =
        contentRangeMatch &&
        contentRangeMatch[3] !== '*'
          ? Number(
              contentRangeMatch[3],
            )
          : null;

    let outputLength:
      | number
      | null =
        Number.isSafeInteger(
          upstreamLength,
        ) &&
        upstreamLength >= 0
          ? upstreamLength
          : null;

    if (
      options.forceRange &&
      response.status === 200 &&
      requestedStart != null &&
      requestedStart > 0
    ) {
      response.data.destroy();

      throw new AppError(
        502,
        'UPSTREAM_RANGE_UNSUPPORTED',
        'O servidor de mídia não aceitou continuar deste ponto.',
      );
    }

    if (
      options.forceRange &&
      response.status === 200 &&
      requestedStart === 0 &&
      outputLength != null
    ) {
      outputStatus = 206;
      outputStart = 0;
      outputTotal =
        outputLength;
      outputEnd =
        Math.min(
          outputLength - 1,
          maxChunkBytes - 1,
        );
      outputLength =
        outputEnd + 1;
    } else if (
      response.status === 206 &&
      outputStart != null &&
      outputEnd != null
    ) {
      if (
        options.forceRange &&
        requestedStart != null &&
        outputStart !== requestedStart
      ) {
        response.data.destroy();

        throw new AppError(
          502,
          'INVALID_UPSTREAM_RANGE_START',
          'O servidor de mídia respondeu a partir de um ponto incorreto.',
        );
      }

      outputEnd =
        Math.min(
          outputEnd,
          requestedEnd ??
            Number.MAX_SAFE_INTEGER,
          outputStart +
            maxChunkBytes -
            1,
        );

      outputLength =
        outputEnd -
        outputStart +
        1;
    }

    if (
      options.forceRange &&
      outputStatus !== 206
    ) {
      response.data.destroy();

      throw new AppError(
        502,
        'INVALID_UPSTREAM_RANGE',
        'O servidor de mídia enviou uma resposta de intervalo inválida.',
      );
    }

    res.status(outputStatus);

    const contentType =
      response.headers[
        'content-type'
      ];

    if (contentType) {
      res.setHeader(
        'content-type',
        contentType,
      );
    }

    for (
      const header of [
        'etag',
        'last-modified',
        'content-disposition',
      ]
    ) {
      const value =
        response.headers[header];

      if (value != null) {
        res.setHeader(
          header,
          value,
        );
      }
    }

    if (outputLength != null) {
      res.setHeader(
        'content-length',
        String(outputLength),
      );
    }

    if (
      outputStatus === 206 &&
      outputStart != null &&
      outputEnd != null
    ) {
      res.setHeader(
        'content-range',
        `bytes ${outputStart}-${outputEnd}/${outputTotal ?? '*'}`,
      );

      res.setHeader(
        'accept-ranges',
        'bytes',
      );
    } else if (
      requestedRange ||
      options.forceRange
    ) {
      res.setHeader(
        'accept-ranges',
        'bytes',
      );
    }

    res.setHeader(
      'cache-control',
      options.cacheSeconds > 0
        ? `private, max-age=${options.cacheSeconds}`
        : 'private, no-store',
    );

    res.setHeader(
      'x-accel-buffering',
      'no',
    );

    res.flushHeaders();

    const upstreamStream =
      response.data;

    let completed = false;

    const abortUpstream = () => {
      if (!completed) {
        upstreamStream.destroy();
      }
    };

    req.once(
      'aborted',
      abortUpstream,
    );

    res.once(
      'close',
      abortUpstream,
    );

    let remaining =
      outputLength;

    try {
      for await (
        const chunk of upstreamStream
      ) {
        if (
          req.aborted ||
          res.destroyed
        ) {
          return;
        }

        const buffer =
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);

        const output =
          remaining == null
            ? buffer
            : buffer.subarray(
                0,
                Math.min(
                  buffer.length,
                  remaining,
                ),
              );

        if (
          output.length > 0 &&
          !res.write(output)
        ) {
          await once(
            res,
            'drain',
          );
        }

        if (remaining != null) {
          remaining -=
            output.length;

          if (remaining <= 0) {
            break;
          }
        }
      }

      completed = true;

      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      completed = true;

      if (
        req.aborted ||
        req.destroyed ||
        res.destroyed
      ) {
        return;
      }

      throw error;
    } finally {
      completed = true;

      upstreamStream.destroy();

      req.removeListener(
        'aborted',
        abortUpstream,
      );

      res.removeListener(
        'close',
        abortUpstream,
      );
    }
  }
}
