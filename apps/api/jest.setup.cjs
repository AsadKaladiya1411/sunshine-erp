process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/sunshine_erp";
process.env.CORS_ALLOWED_ORIGINS ??= "http://localhost:3000";
process.env.RATE_LIMIT_WINDOW_MS ??= "60000";
process.env.RATE_LIMIT_MAX_REQUESTS ??= "100";
process.env.REQUEST_BODY_LIMIT_BYTES ??= "1024";
process.env.JWT_ISSUER ??= "sunshine-erp-api-test";
process.env.JWT_AUDIENCE ??= "sunshine-erp-test";
process.env.JWT_SECRET ??=
  "test-only-jwt-secret-with-at-least-thirty-two-characters";
process.env.JWT_ALGORITHM ??= "HS256";
process.env.JWT_ACCESS_TOKEN_LIFETIME_SECONDS ??= "900";
process.env.REFRESH_TOKEN_LIFETIME_SECONDS ??= "604800";
process.env.REFRESH_TOKEN_DIGEST_SECRET ??=
  "test-only-refresh-digest-secret-with-at-least-thirty-two-characters";
process.env.PASSWORD_MIN_LENGTH ??= "12";
process.env.BCRYPT_COST ??= "12";
process.env.PASSWORD_HISTORY_DEPTH ??= "5";
process.env.ACCOUNT_LOCK_FAILED_ATTEMPTS ??= "5";
process.env.ACCOUNT_LOCK_DURATION_MS ??= "900000";
process.env.DEFAULT_MAX_CONCURRENT_SESSIONS ??= "5";
process.env.REFRESH_COOKIE_NAME ??= "sunshine_refresh_token";
process.env.REFRESH_COOKIE_SECURE ??= "false";
process.env.REFRESH_COOKIE_SAME_SITE ??= "strict";
process.env.REFRESH_COOKIE_PATH ??= "/api/v1/auth";
process.env.PASSWORD_RESET_TOKEN_LIFETIME_SECONDS ??= "1800";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";
process.env.REDIS_CONNECT_TIMEOUT_MS ??= "500";
process.env.REDIS_KEY_PREFIX ??= "sunshine";
process.env.LOG_LEVEL = "fatal";
