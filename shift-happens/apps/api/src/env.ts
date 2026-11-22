import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  resolve(here, '../../../.env'),
  resolve(process.cwd(), '.env'),
]) {
  config({ path: candidate });
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().default(''),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:3010,http://localhost:3000,http://localhost:3001'),
  WEB_ORIGIN: z.string().default('http://localhost:3010'),
  RESTAURANT_ID: z.string().uuid().default('11111111-1111-4111-8111-111111111111'),
  TWILIO_ACCOUNT_SID: z.string().optional().default(''),
  TWILIO_AUTH_TOKEN: z.string().optional().default(''),
  TWILIO_PHONE_NUMBER: z.string().optional().default(''),
  TWILIO_SMS_FROM: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  GEMINI_EMBED_MODEL: z.string().default('text-embedding-004'),
  SENDGRID_API_KEY: z.string().optional().default(''),
  SENDGRID_FROM_EMAIL: z.string().optional().default('ops@shifthappens.local'),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
});

export const env = schema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
