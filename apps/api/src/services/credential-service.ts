import type { PrismaClient } from '@prisma/client';
import type { XtreamCredentials } from '../infrastructure/http/xtream-client.js';
import type { MemoryCache } from '../infrastructure/cache/memory-cache.js';
import type { AesGcmCodec } from '../security/aes-gcm.js';
import { AppError } from '../utils/errors.js';

export class CredentialService {
  constructor(
    private readonly db: PrismaClient,
    private readonly cache: MemoryCache,
    private readonly codec: AesGcmCodec,
  ) {}

  setEphemeral(sessionId: string, credentials: XtreamCredentials, ttlMs: number): void {
    this.cache.set(`credentials:${sessionId}`, credentials, ttlMs);
  }

  async getForSession(sessionId: string, expectedUserId: string): Promise<XtreamCredentials> {
    const session = await this.db.session.findUnique({
      where: { id: sessionId },
      include: { credential: true },
    });
    if (!session || session.userId !== expectedUserId || session.revokedAt || session.expiresAt <= new Date()) {
      throw new AppError(401, 'SESSION_EXPIRED', 'Sessão expirada.');
    }

    if (session.credential) {
      return this.codec.decrypt<XtreamCredentials>(
        session.credential.encryptedPayload,
        session.userId,
      );
    }

    const ephemeral = this.cache.get<XtreamCredentials>(`credentials:${session.id}`);
    if (!ephemeral) {
      throw new AppError(401, 'CREDENTIALS_UNAVAILABLE', 'Faça login novamente.');
    }
    return ephemeral;
  }

  clearEphemeral(sessionId: string): void {
    this.cache.deleteByPrefix(`credentials:${sessionId}`);
  }
}
