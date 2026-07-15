import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppError } from '../utils/errors.js';

interface Envelope {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

export class AesGcmCodec {
  constructor(
    private readonly key: Buffer,
    private readonly version = 1,
  ) {
    if (key.length !== 32) throw new Error('AES-256-GCM requires a 32-byte key');
  }

  encrypt<T>(payload: T, aad?: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    if (aad) cipher.setAAD(Buffer.from(aad));
    const plaintext = Buffer.from(JSON.stringify(payload));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope: Envelope = {
      v: this.version,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      data: ciphertext.toString('base64url'),
    };
    return Buffer.from(JSON.stringify(envelope)).toString('base64url');
  }

  decrypt<T>(encoded: string, aad?: string): T {
    try {
      const envelope = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Envelope;
      if (envelope.v !== this.version) throw new Error('Unsupported key version');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(envelope.iv, 'base64url'),
      );
      if (aad) decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.data, 'base64url')),
        decipher.final(),
      ]);
      return JSON.parse(plaintext.toString('utf8')) as T;
    } catch {
      throw new AppError(400, 'INVALID_SECURE_PAYLOAD', 'Payload seguro inválido.');
    }
  }
}
