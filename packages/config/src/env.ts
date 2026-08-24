import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().url(),

  KAFKA_BROKERS: z.string().min(1),

  STORAGE_ENDPOINT: z.string().url(),

  STORAGE_ACCESS_KEY: z.string().min(1),

  STORAGE_SECRET_KEY: z.string().min(1),

  STORAGE_BUCKET: z.string().min(1),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export const env = envSchema.parse(process.env);