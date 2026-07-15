import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE } from '../security/cookies.js';
import { safeEqual } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const header = req.header('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) {
    next(new AppError(403, 'CSRF_VALIDATION_FAILED', 'Requisição não autorizada.'));
    return;
  }
  next();
}
