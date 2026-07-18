import { once } from 'node:events';
import { isAxiosError } from 'axios';
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
      async () =>
        this.xtream.streamUrl(
          credentials,
          {
            type:
              media.type as
                | 'live'
                | 'movie'
                | 'episode',
            providerId: media.providerId,
            ...(media.extension
              ? { extension: media.extension }
              : {}),
          },
        ),
      {
        forceRange:
          media.type === 'movie' ||
          media.type === 'episode',
        cacheSeconds:
          media.type === 'live'
            ? 5
            : 120,
        maxAttempts: 7,
        upstreamIdleTimeoutMs: 18_000,
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
      async () => target.url,
      {
        forceRange: false,
        cacheSeconds: 30,
        maxAttempts: 5,
        upstreamIdleTimeoutMs: 15_000,
      },
    );
  }

  private async proxyBinary(
    req: Request,
    res: Response,
    resolveUpstream: () => Promise<URL>,
    options: {
      forceRange: boolean;
      cacheSeconds: number;
      maxAttempts: number;
      upstreamIdleTimeoutMs: number;
    },
  ): Promise<void> {
    const maxChunkBytes = 64 * 1024 * 1024;
    const requestedRange = req.header('range');
    const ifRange = req.header('if-range');

    if (requestedRange && !/^bytes=\d*-\d*$/.test(requestedRange)) {
      throw new AppError(416, 'INVALID_RANGE', 'Intervalo de mídia inválido.');
    }

    const match = requestedRange
      ? /^bytes=(\d*)-(\d*)$/.exec(requestedRange)
      : null;

    let requestedStart: number | null = null;
    let requestedEnd: number | null = null;
    let suffixLength: number | null = null;

    if (match?.[1]) {
      requestedStart = Number(match[1]);
      requestedEnd = match[2] ? Number(match[2]) : null;

      if (
        !Number.isSafeInteger(requestedStart) ||
        requestedStart < 0 ||
        (requestedEnd != null &&
          (!Number.isSafeInteger(requestedEnd) || requestedEnd < requestedStart))
      ) {
        throw new AppError(416, 'INVALID_RANGE', 'Intervalo de mídia inválido.');
      }
    } else if (match?.[2]) {
      suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        throw new AppError(416, 'INVALID_RANGE', 'Intervalo de mídia inválido.');
      }
      suffixLength = Math.min(suffixLength, maxChunkBytes);
    } else if (options.forceRange) {
      requestedStart = 0;
      requestedEnd = maxChunkBytes - 1;
    }

    req.setTimeout(0);
    res.setTimeout(0);

    let bytesSent = 0;
    let outputLength: number | null = null;
    let outputStart: number | null = null;
    let outputEnd: number | null = null;
    let outputTotal: number | null = null;
    let headersSent = false;
    let attempt = 0;
    let lastError: unknown = null;

    const retryDelay = async (currentAttempt: number): Promise<void> => {
      const delay = Math.min(4_000, 350 * 2 ** Math.max(0, currentAttempt - 1));
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    };

    const isRetryable = (error: unknown): boolean => {
      if (!isAxiosError(error)) return true;
      const status = error.response?.status;
      if (status != null) {
        return [404, 408, 409, 425, 429, 500, 502, 503, 504].includes(status);
      }
      return [
        'ECONNRESET',
        'ECONNABORTED',
        'ETIMEDOUT',
        'EPIPE',
        'ENETUNREACH',
        'EHOSTUNREACH',
        'UND_ERR_SOCKET',
      ].includes(error.code ?? '');
    };

    while (attempt < options.maxAttempts) {
      attempt += 1;
      let upstreamStream: Readable | null = null;
      let clientClosed = false;

      const abortUpstream = (): void => {
        clientClosed = true;
        upstreamStream?.destroy();
      };

      req.once('aborted', abortUpstream);
      res.once('close', abortUpstream);

      try {
        const upstream = await resolveUpstream();
        let rangeHeader: string | undefined;

        if (suffixLength != null && bytesSent === 0) {
          rangeHeader = `bytes=-${suffixLength}`;
        } else if (requestedStart != null) {
          const resumeStart = requestedStart + bytesSent;
          const cappedEnd = Math.min(
            requestedEnd ?? Number.MAX_SAFE_INTEGER,
            requestedStart + maxChunkBytes - 1,
          );
          rangeHeader = `bytes=${resumeStart}-${cappedEnd}`;
        }

        const { response } = await axiosGetWithValidatedRedirects<Readable>(
          upstream,
          {
            responseType: 'stream',
            timeout: options.upstreamIdleTimeoutMs,
            maxBodyLength: Number.POSITIVE_INFINITY,
            maxContentLength: Number.POSITIVE_INFINITY,
            decompress: false,
            headers: {
              'User-Agent': 'NexStream/0.1',
              Accept: '*/*',
              'Accept-Encoding': 'identity',
              Connection: 'keep-alive',
              ...(rangeHeader ? { Range: rangeHeader } : {}),
              ...(ifRange && bytesSent === 0 ? { 'If-Range': ifRange } : {}),
            },
          },
        );

        upstreamStream = response.data;

        const contentRangeHeader =
          typeof response.headers['content-range'] === 'string'
            ? response.headers['content-range']
            : null;
        const contentRangeMatch = contentRangeHeader
          ? /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRangeHeader)
          : null;
        const upstreamLength = Number(response.headers['content-length']);
        const responseStart = contentRangeMatch ? Number(contentRangeMatch[1]) : null;
        const responseEnd = contentRangeMatch ? Number(contentRangeMatch[2]) : null;
        const responseTotal =
          contentRangeMatch && contentRangeMatch[3] !== '*'
            ? Number(contentRangeMatch[3])
            : null;
        const responseLength =
          Number.isSafeInteger(upstreamLength) && upstreamLength >= 0
            ? upstreamLength
            : null;

        if (options.forceRange && requestedStart != null) {
          const expectedStart = requestedStart + bytesSent;
          if (response.status !== 206 || responseStart !== expectedStart) {
            upstreamStream.destroy();
            throw new AppError(
              502,
              'UPSTREAM_RANGE_UNSUPPORTED',
              'O servidor de mídia não aceitou continuar do ponto solicitado.',
            );
          }
        }

        if (!headersSent) {
          let outputStatus = response.status;
          outputStart = responseStart;
          outputEnd = responseEnd;
          outputTotal = responseTotal;
          outputLength = responseLength;

          if (response.status === 206 && outputStart != null && outputEnd != null) {
            outputEnd = Math.min(
              outputEnd,
              requestedEnd ?? Number.MAX_SAFE_INTEGER,
              outputStart + maxChunkBytes - 1,
            );
            outputLength = outputEnd - outputStart + 1;
          }

          res.status(outputStatus);
          const contentType = response.headers['content-type'];
          if (contentType) res.setHeader('content-type', contentType);

          for (const header of ['etag', 'last-modified', 'content-disposition']) {
            const value = response.headers[header];
            if (value != null) res.setHeader(header, value);
          }

          if (outputLength != null) {
            res.setHeader('content-length', String(outputLength));
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
            res.setHeader('accept-ranges', 'bytes');
          } else if (requestedRange || options.forceRange) {
            res.setHeader('accept-ranges', 'bytes');
          }

          res.setHeader(
            'cache-control',
            options.cacheSeconds > 0
              ? `private, max-age=${options.cacheSeconds}`
              : 'private, no-store',
          );
          res.setHeader('x-accel-buffering', 'no');
          res.setHeader('x-nexstream-recovery', 'enabled');
          res.flushHeaders();
          headersSent = true;
        }

        const remainingAtStart =
          outputLength == null ? null : Math.max(0, outputLength - bytesSent);
        let remaining = remainingAtStart;

        for await (const chunk of upstreamStream) {
          if (req.aborted || req.destroyed || res.destroyed || clientClosed) return;

          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const output =
            remaining == null
              ? buffer
              : buffer.subarray(0, Math.min(buffer.length, remaining));

          if (output.length > 0) {
            if (!res.write(output)) await once(res, 'drain');
            bytesSent += output.length;
            if (remaining != null) remaining -= output.length;
          }

          if (remaining != null && remaining <= 0) break;
        }

        if (outputLength == null || bytesSent >= outputLength) {
          if (!res.writableEnded) res.end();
          return;
        }

        throw new Error(
          `UPSTREAM_PREMATURE_CLOSE: ${bytesSent}/${outputLength} bytes`,
        );
      } catch (error) {
        lastError = error;

        if (req.aborted || req.destroyed || res.destroyed || clientClosed) return;

        const canRetry =
          attempt < options.maxAttempts &&
          isRetryable(error) &&
          (outputLength == null || bytesSent < outputLength);

        console.warn(
          JSON.stringify({
            event: 'playback_upstream_retry',
            attempt,
            maxAttempts: options.maxAttempts,
            bytesSent,
            outputLength,
            retry: canRetry,
            axiosCode: isAxiosError(error) ? error.code : undefined,
            upstreamStatus: isAxiosError(error) ? error.response?.status : undefined,
            message: error instanceof Error ? error.message : String(error),
          }),
        );

        if (!canRetry) break;
        await retryDelay(attempt);
      } finally {
        upstreamStream?.destroy();
        req.removeListener('aborted', abortUpstream);
        res.removeListener('close', abortUpstream);
      }
    }

    if (headersSent) {
      res.destroy(
        lastError instanceof Error
          ? lastError
          : new Error('Falha permanente no servidor de mídia.'),
      );
      return;
    }

    if (isAxiosError(lastError)) {
      const status = lastError.response?.status;
      if (status === 404) {
        throw new AppError(
          502,
          'UPSTREAM_MEDIA_NOT_FOUND',
          'O provedor não localizou o vídeo. A URL foi renovada, mas continuou indisponível.',
        );
      }
      if (status === 429 || status === 503) {
        throw new AppError(
          503,
          'UPSTREAM_TEMPORARILY_UNAVAILABLE',
          'O servidor IPTV está temporariamente ocupado. Tente novamente em instantes.',
        );
      }
    }

    throw new AppError(
      502,
      'UPSTREAM_STREAM_FAILED',
      'Não foi possível manter a conexão com o servidor de vídeo.',
    );
  }
}
