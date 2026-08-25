process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/sunshine_erp";
process.env.CORS_ALLOWED_ORIGINS ??= "http://localhost:3000";
process.env.RATE_LIMIT_WINDOW_MS ??= "60000";
process.env.RATE_LIMIT_MAX_REQUESTS ??= "100";
process.env.REQUEST_BODY_LIMIT_BYTES ??= "1024";
process.env.LOG_LEVEL = "fatal";
