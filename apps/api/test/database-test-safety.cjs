const TEST_DATABASE_NAME = "sunshine_erp_test";
const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

function fail(reason) {
  throw new Error(
    `Unsafe database integration test configuration: ${reason}. ` +
      `Set NODE_ENV=test and provide an explicit local PostgreSQL ` +
      `DATABASE_URL whose database name is ${TEST_DATABASE_NAME}.`,
  );
}

function assertSafeTestDatabaseEnvironment(environment) {
  if (environment.NODE_ENV !== "test") {
    fail("NODE_ENV must be test");
  }

  const databaseUrl = environment.DATABASE_URL;
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    fail("DATABASE_URL is required and is never defaulted by the test suite");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    fail("DATABASE_URL must be a valid URL");
  }

  if (
    parsedUrl.protocol !== "postgresql:" &&
    parsedUrl.protocol !== "postgres:"
  ) {
    fail("DATABASE_URL must use the PostgreSQL protocol");
  }

  if (!LOOPBACK_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
    fail("DATABASE_URL must target a loopback host");
  }

  if (parsedUrl.searchParams.size > 0) {
    fail("DATABASE_URL query parameters are not allowed for integration tests");
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  } catch {
    fail("DATABASE_URL contains an invalid database name");
  }

  if (databaseName !== TEST_DATABASE_NAME) {
    fail(`DATABASE_URL must identify ${TEST_DATABASE_NAME}`);
  }

  return Object.freeze({
    databaseName,
    hostname: parsedUrl.hostname,
  });
}

module.exports = {
  TEST_DATABASE_NAME,
  assertSafeTestDatabaseEnvironment,
};
