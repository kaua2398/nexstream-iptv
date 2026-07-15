import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const supplied = req.header('x-correlation-id');
  const id = supplied && /^[a-zA-Z0-9_-]{8,128}$/.test(supplied) ? supplied : randomUUID();
  res.locals.correlationId = id;
  res.setHeader('x-correlation-id', id);
  next();
}
