import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { Client } from "pg";

import { PrismaClient } from "../../generated/prisma/client.js";

const foundationMigrationPath = fileURLToPath(
  new URL(
    "../../../../../prisma/migrations/20260825150000_common_administration_foundation/migration.sql",
    import.meta.url,
  ),
);
const authenticationMigrationPath = fileURLToPath(
  new URL(
    "../../../../../prisma/migrations/20260825220000_authentication_foundation/migration.sql",
    import.meta.url,
  ),
);
const schemaName = `auth_foundation_test_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests.");
}

jest.setTimeout(60_000);

async function expectDatabaseError(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error: unknown) {
    expect(error).toMatchObject({ code: expectedCode });
    return;
  }

  throw new Error(`Expected database error code ${expectedCode}.`);
}

describe("authentication persistence migration", () => {
  let adminClient: Client;
  let sqlClient: Client;
  let prisma: PrismaClient;
  let organizationId: string;
  let userId: string;

  beforeAll(async () => {
    adminClient = new Client({ connectionString: databaseUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE SCHEMA ${quotedSchemaName}`);
    await adminClient.query(`SET search_path TO ${quotedSchemaName}`);
    await adminClient.query(await readFile(foundationMigrationPath, "utf8"));
    await adminClient.query(await readFile(authenticationMigrationPath, "utf8"));
    await adminClient.query("RESET search_path");

    sqlClient = new Client({
      connectionString: databaseUrl,
      options: `-c search_path=${schemaName}`,
    });
    await sqlClient.connect();
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: databaseUrl },
        { schema: schemaName },
      ),
    });

    const organization = await prisma.organization.create({
      data: {
        organizationCode: "AUTH-TEST",
        organizationName: "Authentication Test Organization",
        status: "Active",
      },
    });
    organizationId = organization.id;
    const department = await prisma.department.create({
      data: {
        organizationId,
        departmentCode: "ADMIN",
        departmentName: "Administration",
        status: "Active",
      },
    });
    const user = await prisma.user.create({
      data: {
        organizationId,
        departmentId: department.id,
        firstName: "Auth",
        email: "auth@test.invalid",
        username: "auth-test",
        passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
        status: "Active",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await sqlClient?.end();
    if (adminClient) {
      await adminClient.query(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
      await adminClient.end();
    }
  });

  it("adds only the three approved authentication persistence tables", async () => {
    const result = await sqlClient.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 ORDER BY table_name`,
      [schemaName],
    );

    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      "cities",
      "countries",
      "departments",
      "financial_years",
      "organization_settings",
      "organizations",
      "password_reset_tokens",
      "states",
      "user_password_history",
      "user_session_token_history",
      "user_sessions",
      "users",
    ]);
  });

  it("enforces approved User, Organization Settings, and Session statuses", async () => {
    await expectDatabaseError(
      () =>
        sqlClient.query("UPDATE users SET status = 'Unknown' WHERE id = $1", [
          userId,
        ]),
      "23514",
    );
    await expectDatabaseError(
      () =>
        sqlClient.query(
          `INSERT INTO organization_settings
             (id, organization_id, default_currency, default_language,
              default_time_zone, date_format, max_concurrent_sessions, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            organizationId,
            "INR",
            "en",
            "Asia/Calcutta",
            "DD-MM-YYYY",
            0,
            "Active",
          ],
        ),
      "23514",
    );
    await expectDatabaseError(
      () =>
        sqlClient.query(
          `INSERT INTO user_sessions
             (id, organization_id, user_id, session_token_hash, expires_at, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            organizationId,
            userId,
            "invalid-status-token-hash",
            new Date(Date.now() + 60_000),
            "Unknown",
          ],
        ),
      "23514",
    );
  });

  it("enforces organization-safe authentication foreign keys and token uniqueness", async () => {
    const session = await prisma.userSession.create({
      data: {
        organizationId,
        userId,
        sessionTokenHash: "current-refresh-token-hash",
        expiresAt: new Date(Date.now() + 60_000),
        status: "Active",
      },
    });
    await prisma.userSessionTokenHistory.create({
      data: {
        organizationId,
        userSessionId: session.id,
        tokenHash: "retired-refresh-token-hash",
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        retiredAt: new Date(),
        retirementReason: "Rotated",
      },
    });
    await prisma.userPasswordHistory.create({
      data: {
        organizationId,
        userId,
        passwordHash: "historical-password-hash",
      },
    });
    await prisma.passwordResetToken.create({
      data: {
        organizationId,
        userId,
        tokenHash: "password-reset-token-hash",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expectDatabaseError(
      () =>
        prisma.passwordResetToken.create({
          data: {
            organizationId,
            userId,
            tokenHash: "another-unresolved-reset-token",
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      "P2002",
    );
    await expectDatabaseError(
      () =>
        sqlClient.query(
          `INSERT INTO user_password_history
             (id, organization_id, user_id, password_hash)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), randomUUID(), userId, "cross-organization-hash"],
        ),
      "23503",
    );
  });
});
