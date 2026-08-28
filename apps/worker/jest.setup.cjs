process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/sunshine_erp";
process.env.KAFKA_ENABLED ??= "false";
process.env.LOG_LEVEL = "fatal";
