import axios from 'axios';
import type { Response } from 'express';
import type { AesGcmCodec } from '../security/aes-gcm.js';
import { validatePublicHttpUrl } from '../security/ssrf.js';
import { AppError } from '../utils/errors.js';

interface ImageTokenPayload {
  userId: string;
  url: string;
  expiresAt: number;
}

export class ImageProxyService {
  constructor(private readonly codec: AesGcmCodec) {}

  issue(url: string | null, userId: string): string | null {
    if (!url) return null;
    const token = this.codec.encrypt<ImageTokenPayload>(
      { userId, url, expiresAt: Date.now() + 24 * 60 * 60 * 1000 },
      'nexstream-image',
    );
    return `/api/v1/images/${encodeURIComponent(token)}`;
  }

  async proxy(token: string, userId: string, res: Response): Promise<void> {
    const payload = this.codec.decrypt<ImageTokenPayload>(token, 'nexstream-image');
    if (payload.userId !== userId || payload.expiresAt <= Date.now()) {
      throw new AppError(404, 'IMAGE_NOT_FOUND', 'Imagem não encontrada.');
    }
    const target = await validatePublicHttpUrl(payload.url);
    const response = await axios.get<NodeJS.ReadableStream>(target.url.toString(), {
      responseType: 'stream',
      timeout: 8_000,
      maxRedirects: 0,
      maxContentLength: 5 * 1024 * 1024,
      headers: { 'User-Agent': 'NexStream/0.1' },
      validateStatus: (status) => status === 200,
    });
    const contentType = String(response.headers['content-type'] ?? '');
    if (!contentType.startsWith('image/')) {
      response.data.destroy();
      throw new AppError(415, 'INVALID_IMAGE', 'Formato de imagem inválido.');
    }
    res.setHeader('content-type', contentType);
    res.setHeader('cache-control', 'private, max-age=3600');
    res.setHeader('x-content-type-options', 'nosniff');
    response.data.pipe(res);
  }
}
