import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),

  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    )
    .pipe(z.array(z.string().url()).min(1)),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  REQUEST_BODY_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1_048_576),

  REDIS_URL: z.string().url().optional(),

  KAFKA_BROKERS: z.string().min(1).optional(),

  STORAGE_ENDPOINT: z.string().url().optional(),

  STORAGE_ACCESS_KEY: z.string().min(1).optional(),

  STORAGE_SECRET_KEY: z.string().min(1).optional(),

  STORAGE_BUCKET: z.string().min(1).optional(),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export const env = envSchema.parse(process.env);
