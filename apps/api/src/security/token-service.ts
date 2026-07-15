import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export interface AccessClaims {
  userId: string;
  sessionId: string;
  jti: string;
}

const issuer = 'nexstream-api';
const audience = 'nexstream-web';
const secret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);

export async function createAccessToken(userId: string, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer,
      audience,
    });
    if (protectedHeader.alg !== 'HS256' || !payload.sub || !payload.sid || !payload.jti) {
      throw new Error('Invalid claims');
    }
    return {
      userId: payload.sub,
      sessionId: String(payload.sid),
      jti: payload.jti,
    };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  }
}
