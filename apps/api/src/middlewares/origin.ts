import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function validateOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.header('origin');
  if (!origin || origin !== env.WEB_ORIGIN) {
    next(new AppError(403, 'INVALID_ORIGIN', 'Origem não permitida.'));
    return;
  }
  next();
}
