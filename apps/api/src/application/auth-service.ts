import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { LoginRequest } from '@nexstream/shared';
import type { XtreamClient, XtreamCredentials } from '../infrastructure/http/xtream-client.js';
import type { CredentialService } from '../services/credential-service.js';
import type { AesGcmCodec } from '../security/aes-gcm.js';
import { createAccessToken } from '../security/token-service.js';
import { env } from '../config/env.js';
import { pepperedHash, randomToken, sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  user: { id: string; displayName: string | null };
}

export class AuthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly xtream: XtreamClient,
    private readonly credentials: CredentialService,
    private readonly credentialCodec: AesGcmCodec,
  ) {}

  private async issueRefreshToken(sessionId: string): Promise<string> {
    const raw = randomToken(48);
    await this.db.refreshToken.create({
      data: {
        sessionId,
        jti: randomUUID(),
        tokenHash: pepperedHash(raw, env.REFRESH_TOKEN_PEPPER),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return raw;
  }

  async login(input: LoginRequest, correlationId?: string): Promise<IssuedTokens> {
    const normalizedUrl = new URL(input.serverUrl);
    normalizedUrl.hash = '';
    const xtreamCredentials: XtreamCredentials = {
      serverUrl: normalizedUrl.toString(),
      username: input.username,
      password: input.password,
    };
    const auth = await this.xtream.authenticate(xtreamCredentials);
    const providerKey = sha256(`${normalizedUrl.origin}${normalizedUrl.pathname}|${input.username}`);
    const user = await this.db.user.upsert({
      where: { providerKey },
      update: { displayName: auth.providerUsername },
      create: { providerKey, displayName: auth.providerUsername },
    });

    let credentialId: string | null = null;
    if (input.remember) {
      const encryptedPayload = this.credentialCodec.encrypt(xtreamCredentials, user.id);
      const stored = await this.db.xtreamCredential.create({
        data: { userId: user.id, encryptedPayload, persistent: true, keyVersion: 1 },
      });
      credentialId = stored.id;
    }

    const session = await this.db.session.create({
      data: {
        userId: user.id,
        credentialId,
        tokenFamilyId: randomUUID(),
        expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    if (!input.remember) {
      this.credentials.setEphemeral(
        session.id,
        xtreamCredentials,
        env.SESSION_IDLE_TTL_SECONDS * 1000,
      );
    }

    const activeSessions = await this.db.session.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: 5,
      select: { id: true },
    });
    if (activeSessions.length) {
      const revokedAt = new Date();
      await this.db.session.updateMany({
        where: { id: { in: activeSessions.map((item) => item.id) } },
        data: { revokedAt },
      });
    }

    await this.db.auditEvent.create({
      data: {
        userId: user.id,
        eventType: 'LOGIN_SUCCESS',
        ...(correlationId ? { correlationId } : {}),
      },
    });

    return {
      accessToken: await createAccessToken(user.id, session.id),
      refreshToken: await this.issueRefreshToken(session.id),
      csrfToken: randomToken(24),
      user: { id: user.id, displayName: user.displayName },
    };
  }

  async refresh(rawToken: string): Promise<Omit<IssuedTokens, 'user'> & { user: IssuedTokens['user'] }> {
    const tokenHash = pepperedHash(rawToken, env.REFRESH_TOKEN_PEPPER);
    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: { include: { user: true } } },
    });
    if (!stored) throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Sessão inválida.');

    const now = new Date();
    if (stored.usedAt || stored.revokedAt) {
      await this.db.session.update({
        where: { id: stored.sessionId },
        data: { revokedAt: now },
      });
      await this.db.refreshToken.updateMany({
        where: { sessionId: stored.sessionId },
        data: { revokedAt: now },
      });
      throw new AppError(401, 'REFRESH_TOKEN_REUSE', 'Sessão revogada.');
    }

    if (
      stored.expiresAt <= now ||
      stored.session.revokedAt ||
      stored.session.expiresAt <= now ||
      stored.session.lastSeenAt.getTime() + env.SESSION_IDLE_TTL_SECONDS * 1000 <= Date.now()
    ) {
      throw new AppError(401, 'SESSION_EXPIRED', 'Sessão expirada.');
    }

    await this.db.$transaction([
      this.db.refreshToken.update({ where: { id: stored.id }, data: { usedAt: now } }),
      this.db.session.update({ where: { id: stored.sessionId }, data: { lastSeenAt: now } }),
    ]);

    return {
      accessToken: await createAccessToken(stored.session.userId, stored.sessionId),
      refreshToken: await this.issueRefreshToken(stored.sessionId),
      csrfToken: randomToken(24),
      user: { id: stored.session.user.id, displayName: stored.session.user.displayName },
    };
  }

  async logout(sessionId: string): Promise<void> {
    const revokedAt = new Date();
    await this.db.$transaction([
      this.db.session.updateMany({ where: { id: sessionId }, data: { revokedAt } }),
      this.db.refreshToken.updateMany({ where: { sessionId }, data: { revokedAt } }),
      this.db.playbackToken.updateMany({ where: { sessionId }, data: { revokedAt } }),
    ]);
    this.credentials.clearEphemeral(sessionId);
  }
}
