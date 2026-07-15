import type { MediaType } from '@nexstream/shared';
import { AesGcmCodec } from './aes-gcm.js';
import { AppError } from '../utils/errors.js';

export interface OpaqueMediaPayload {
  userId: string;
  type: MediaType | 'series' | 'category';
  providerId: string;
  extension?: string;
  issuedAt: number;
}

export class OpaqueIdService {
  constructor(private readonly codec: AesGcmCodec) {}

  create(payload: Omit<OpaqueMediaPayload, 'issuedAt'>): string {
    return this.codec.encrypt({ ...payload, issuedAt: Date.now() }, 'nexstream-media-id');
  }

  parse(value: string, expectedUserId: string): OpaqueMediaPayload {
    const payload = this.codec.decrypt<OpaqueMediaPayload>(value, 'nexstream-media-id');
    if (payload.userId !== expectedUserId) {
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'Conteúdo não encontrado.');
    }
    return payload;
  }
}
