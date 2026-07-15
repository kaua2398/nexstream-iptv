import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmCodec } from '../src/security/aes-gcm.js';
import { OpaqueIdService } from '../src/security/opaque-id.js';

it('isolates media identifiers by user', () => {
  const service = new OpaqueIdService(new AesGcmCodec(randomBytes(32)));
  const id = service.create({ userId: 'user-a', type: 'movie', providerId: '123' });
  expect(service.parse(id, 'user-a').providerId).toBe('123');
  expect(() => service.parse(id, 'user-b')).toThrow();
});
