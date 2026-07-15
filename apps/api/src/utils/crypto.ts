import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('base64url');

export const pepperedHash = (value: string, pepper: string): string =>
  createHmac('sha256', pepper).update(value).digest('base64url');

export const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
