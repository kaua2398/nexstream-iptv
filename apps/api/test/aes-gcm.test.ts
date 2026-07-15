import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmCodec } from '../src/security/aes-gcm.js';

it('encrypts and authenticates payloads', () => {
  const codec = new AesGcmCodec(randomBytes(32));
  const encrypted = codec.encrypt({ username: 'hidden', password: 'secret' }, 'user-1');
  expect(encrypted).not.toContain('hidden');
  expect(codec.decrypt(encrypted, 'user-1')).toEqual({ username: 'hidden', password: 'secret' });
  expect(() => codec.decrypt(encrypted, 'user-2')).toThrow();
});
