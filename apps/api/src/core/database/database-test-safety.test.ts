import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@jest/globals";

interface TestDatabaseIdentity {
  readonly databaseName: string;
  readonly hostname: string;
}

interface DatabaseTestSafetyModule {
  readonly TEST_DATABASE_NAME: string;
  readonly assertSafeTestDatabaseEnvironment: (
    environment: Readonly<Record<string, string | undefined>>,
  ) => TestDatabaseIdentity;
}

const require = createRequire(import.meta.url);
const testSafety = require(
  "../../../test/database-test-safety.cjs",
) as DatabaseTestSafetyModule;
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../");

function environment(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> {
  return {
    NODE_ENV: "test",
    DATABASE_URL:
      "postgresql://test-user:test-password@localhost:5432/sunshine_erp_test",
    ...overrides,
  };
}

describe("database integration test safety", () => {
  it("accepts only the explicit local test database identity", () => {
    expect(
      testSafety.assertSafeTestDatabaseEnvironment(environment()),
    ).toEqual({
      databaseName: testSafety.TEST_DATABASE_NAME,
      hostname: "localhost",
    });
  });

  it("rejects the normal development database", () => {
    expect(() =>
      testSafety.assertSafeTestDatabaseEnvironment(
        environment({
          DATABASE_URL:
            "postgresql://test-user:test-password@localhost:5432/sunshine_erp",
        }),
      ),
    ).toThrow("DATABASE_URL must identify sunshine_erp_test");
  });

  it.each([
    {
      name: "production environment",
      overrides: { NODE_ENV: "production" },
      message: "NODE_ENV must be test",
    },
    {
      name: "remote production-looking host",
      overrides: {
        DATABASE_URL:
          "postgresql://erp-user:secret@prod-db.example.com:5432/sunshine_erp_test",
      },
      message: "DATABASE_URL must target a loopback host",
    },
    {
      name: "shared Docker-network host",
      overrides: {
        DATABASE_URL:
          "postgresql://erp-user:secret@postgres:5432/sunshine_erp_test",
      },
      message: "DATABASE_URL must target a loopback host",
    },
    {
      name: "production-named local database",
      overrides: {
        DATABASE_URL:
          "postgresql://erp-user:secret@localhost:5432/sunshine_erp_production",
      },
      message: "DATABASE_URL must identify sunshine_erp_test",
    },
  ])("rejects $name", ({ overrides, message }) => {
    expect(() =>
      testSafety.assertSafeTestDatabaseEnvironment(environment(overrides)),
    ).toThrow(message);
  });

  it.each([
    ["host", "host=prod-db.example.com"],
    ["hostaddr", "hostaddr=203.0.113.10"],
    ["port", "port=6432"],
    ["service", "service=production"],
    ["database", "database=sunshine_erp"],
    ["dbname", "dbname=sunshine_erp"],
    ["db alias", "db=sunshine_erp"],
  ])("rejects the %s query-parameter override", (_name, query) => {
    expect(() =>
      testSafety.assertSafeTestDatabaseEnvironment(
        environment({
          DATABASE_URL:
            `postgresql://test-user:test-password@localhost:5432/` +
            `sunshine_erp_test?${query}`,
        }),
      ),
    ).toThrow(
      "DATABASE_URL query parameters are not allowed for integration tests",
    );
  });

  it.each([
    {
      name: "missing DATABASE_URL",
      overrides: { DATABASE_URL: undefined },
      message: "DATABASE_URL is required",
    },
    {
      name: "invalid DATABASE_URL",
      overrides: { DATABASE_URL: "not-a-url" },
      message: "DATABASE_URL must be a valid URL",
    },
    {
      name: "non-PostgreSQL URL",
      overrides: {
        DATABASE_URL: "mysql://localhost:3306/sunshine_erp_test",
      },
      message: "DATABASE_URL must use the PostgreSQL protocol",
    },
    {
      name: "incorrect test database name",
      overrides: {
        DATABASE_URL:
          "postgresql://test-user:test-password@localhost:5432/other_test",
      },
      message: "DATABASE_URL must identify sunshine_erp_test",
    },
  ])("rejects $name", ({ overrides, message }) => {
    expect(() =>
      testSafety.assertSafeTestDatabaseEnvironment(environment(overrides)),
    ).toThrow(message);
  });

  it("fails from the Jest bootstrap before test modules can run", () => {
    const result = spawnSync(
      process.execPath,
      ["-e", "require('./jest.setup.cjs')"],
      {
        cwd: apiRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "test",
          DATABASE_URL:
            "postgresql://test-user:do-not-log-this@localhost:5432/sunshine_erp",
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Unsafe database integration test configuration",
    );
    expect(result.stderr).not.toContain("do-not-log-this");
  });
});
