import { pino } from 'pino';

type ErrorWithCode = Error & {
  code?: unknown;
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const code = (error as ErrorWithCode).code;

    return {
      type: error.name,
      message: error.message,
      code: typeof code === 'string' ? code : undefined,
      stack: error.stack,
    };
  }

  return {
    type: 'UnknownError',
    message: 'Erro desconhecido',
  };
}

const redactedPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'serverUrl',
  'username',
  'password',
  '*.serverUrl',
  '*.username',
  '*.password',
  '*.token',
  'err.config',
  'err.request',
];

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: redactedPaths,
    censor: '[REDACTED]',
  },
  serializers: {
    err: serializeError,
  },
});