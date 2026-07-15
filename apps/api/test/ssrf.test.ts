import { describe, expect, it } from 'vitest';
import { validatePublicHttpUrl } from '../src/security/ssrf.js';

const blocked = [
  'http://127.0.0.1:8080',
  'http://0.0.0.0',
  'http://169.254.169.254/latest/meta-data',
  'http://10.0.0.1',
  'http://192.168.1.1',
  'http://[::1]',
  'file:///etc/passwd',
];

describe('SSRF protection', () => {
  for (const target of blocked) {
    it(`blocks ${target}`, async () => {
      await expect(validatePublicHttpUrl(target)).rejects.toBeDefined();
    });
  }

  it('rejects credentials embedded in URLs', async () => {
    await expect(validatePublicHttpUrl('https://user:pass@example.com')).rejects.toBeDefined();
  });
});
