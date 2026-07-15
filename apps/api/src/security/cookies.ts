import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';

export const ACCESS_COOKIE = env.COOKIE_SECURE ? '__Host-nexstream_access' : 'nexstream_access';
export const REFRESH_COOKIE = env.COOKIE_SECURE ? '__Host-nexstream_refresh' : 'nexstream_refresh';
export const CSRF_COOKIE = 'nexstream_csrf';

const baseOptions: CookieOptions = {
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
};

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions,
    httpOnly: true,
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions,
    httpOnly: true,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(CSRF_COOKIE, tokens.csrfToken, {
    ...baseOptions,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    res.clearCookie(name, baseOptions);
  }
}
