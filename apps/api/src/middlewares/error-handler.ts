import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', 'Rota não encontrada.'));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = res.locals.correlationId as string | undefined;
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos.', correlationId },
    });
    return;
  }
  if (error instanceof AppError) {
    if (error.statusCode >= 500) logger.error({ err: error, correlationId }, 'request failed');
    res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, correlationId },
    });
    return;
  }
  logger.error({ err: error, correlationId }, 'unexpected request failure');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno.', correlationId },
  });
}
