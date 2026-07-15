import { z } from 'zod';

const keySchema = z
  .string()
  .transform((value) => Buffer.from(value, 'base64'))
  .refine((value) => value.length === 32, 'must decode to exactly 32 bytes');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.string().url(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  DATABASE_URL: z.string().min(1),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  CREDENTIAL_ENCRYPTION_KEY_BASE64: keySchema,
  OPAQUE_ID_ENCRYPTION_KEY_BASE64: keySchema,
  RESOURCE_TOKEN_ENCRYPTION_KEY_BASE64: keySchema,
  IMAGE_TOKEN_ENCRYPTION_KEY_BASE64: keySchema,
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(600),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).default(2_592_000),
  PLAYBACK_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(300).default(180),
  SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(900).default(43_200),
  MAX_CONCURRENT_STREAMS: z.coerce.number().int().min(1).max(10).default(2),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
});

export const env = schema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
