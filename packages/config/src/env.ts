import { z } from "zod";

const developmentJwtSecret =
  "development-only-jwt-secret-change-before-production";
const developmentRefreshDigestSecret =
  "development-only-refresh-digest-secret-change-before-production";

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

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

  JWT_ISSUER: z.string().min(1).default("sunshine-erp-api"),

  JWT_AUDIENCE: z.string().min(1).default("sunshine-erp"),

  JWT_SECRET: z.string().min(32).default(developmentJwtSecret),

  JWT_ALGORITHM: z.enum(["HS256", "HS384", "HS512"]).default("HS256"),

  JWT_ACCESS_TOKEN_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(900),

  REFRESH_TOKEN_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(604_800),

  REFRESH_TOKEN_DIGEST_SECRET: z
    .string()
    .min(32)
    .default(developmentRefreshDigestSecret),

  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(12).default(12),

  BCRYPT_COST: z.coerce.number().int().min(10).max(16).default(12),

  PASSWORD_HISTORY_DEPTH: z.coerce.number().int().positive().default(5),

  ACCOUNT_LOCK_FAILED_ATTEMPTS: z.coerce
    .number()
    .int()
    .positive()
    .default(5),

  ACCOUNT_LOCK_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900_000),

  DEFAULT_MAX_CONCURRENT_SESSIONS: z.coerce
    .number()
    .int()
    .positive()
    .default(5),

  REFRESH_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default("sunshine_refresh_token"),

  REFRESH_COOKIE_SECURE: booleanFromEnvironment.default(false),

  REFRESH_COOKIE_SAME_SITE: z
    .enum(["strict", "lax", "none"])
    .default("strict"),

  REFRESH_COOKIE_PATH: z.string().startsWith("/").default("/api/v1/auth"),

  PASSWORD_RESET_TOKEN_LIFETIME_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_800),

  REDIS_URL: z.string().url().optional(),

  KAFKA_BROKERS: z.string().min(1).optional(),

  STORAGE_ENDPOINT: z.string().url().optional(),

  STORAGE_ACCESS_KEY: z.string().min(1).optional(),

  STORAGE_SECRET_KEY: z.string().min(1).optional(),

  STORAGE_BUCKET: z.string().min(1).optional(),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
}).superRefine((configuration, context) => {
  if (
    configuration.NODE_ENV === "production" &&
    configuration.JWT_SECRET === developmentJwtSecret
  ) {
    context.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "JWT_SECRET must be configured for production.",
    });
  }

  if (
    configuration.NODE_ENV === "production" &&
    configuration.REFRESH_TOKEN_DIGEST_SECRET ===
      developmentRefreshDigestSecret
  ) {
    context.addIssue({
      code: "custom",
      path: ["REFRESH_TOKEN_DIGEST_SECRET"],
      message: "REFRESH_TOKEN_DIGEST_SECRET must be configured for production.",
    });
  }

  if (
    configuration.REFRESH_COOKIE_SAME_SITE === "none" &&
    !configuration.REFRESH_COOKIE_SECURE
  ) {
    context.addIssue({
      code: "custom",
      path: ["REFRESH_COOKIE_SECURE"],
      message: "SameSite=None refresh cookies must be Secure.",
    });
  }
});

export const env = envSchema.parse(process.env);
