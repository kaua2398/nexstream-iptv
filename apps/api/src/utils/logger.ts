import pino from 'pino';

const redactedPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers.set-cookie',
  'serverUrl',
  'username',
  'password',
  '*.serverUrl',
  '*.username',
  '*.password',
  '*.token',
];

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: { paths: redactedPaths, censor: '[REDACTED]' },
});
