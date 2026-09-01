import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { Client } from "pg";

import { ActivityLogRepository } from "../audit/activity-log.repository.js";
import type { RecordActivityInput } from "../audit/activity-log.types.js";
import { AuditService } from "../audit/audit.service.js";
import { PrismaClient } from "../../generated/prisma/client.js";

const migrationPaths = [
  "../../../../../prisma/migrations/20260825150000_common_administration_foundation/migration.sql",
  "../../../../../prisma/migrations/20260825220000_authentication_foundation/migration.sql",
  "../../../../../prisma/migrations/20260827052012_rbac_authorization/migration.sql",
  "../../../../../prisma/migrations/20260827090000_rbac_source_compliance/migration.sql",
  "../../../../../prisma/migrations/20260827120000_activity_logs/migration.sql",
].map((migrationPath) =>
  fileURLToPath(new URL(migrationPath, import.meta.url)),
);

const schemaName = `activity_log_test_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests.");
}

jest.setTimeout(90_000);

describe("Activity Log persistence and service", () => {
  let adminClient: Client;
  let sqlClient: Client;
  let database: PrismaClient;
  let repository: ActivityLogRepository;
  let service: AuditService;
  let organizationId: string;
  let secondOrganizationId: string;
  let userId: string;
  let secondUserId: string;

  beforeAll(async () => {
    adminClient = new Client({ connectionString: databaseUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE SCHEMA ${quotedSchemaName}`);
    await adminClient.query(`SET search_path TO ${quotedSchemaName}`);
    for (const migrationPath of migrationPaths) {
      await adminClient.query(await readFile(migrationPath, "utf8"));
    }
    await adminClient.query("RESET search_path");

    sqlClient = new Client({
      connectionString: databaseUrl,
      options: `-c search_path=${schemaName}`,
    });
    await sqlClient.connect();
    database = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: databaseUrl },
        { schema: schemaName },
      ),
    });
    repository = new ActivityLogRepository(database);
    service = new AuditService(repository);

    const organization = await database.organization.create({
      data: {
        id: randomUUID(),
        organizationCode: "AUDIT-A",
        organizationName: "Audit Organization A",
        status: "Active",
      },
    });
    const secondOrganization = await database.organization.create({
      data: {
        id: randomUUID(),
        organizationCode: "AUDIT-B",
        organizationName: "Audit Organization B",
        status: "Active",
      },
    });
    organizationId = organization.id;
    secondOrganizationId = secondOrganization.id;
    const department = await database.department.create({
      data: {
        organizationId,
        departmentCode: "ADMIN",
        departmentName: "Administration",
        status: "Active",
      },
    });
    const secondDepartment = await database.department.create({
      data: {
        organizationId: secondOrganizationId,
        departmentCode: "ADMIN",
        departmentName: "Administration",
        status: "Active",
      },
    });
    userId = (
      await database.user.create({
        data: {
          organizationId,
          departmentId: department.id,
          firstName: "Audit",
          email: "audit-a@test.invalid",
          username: "audit-a",
          passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
          status: "Active",
        },
      })
    ).id;
    secondUserId = (
      await database.user.create({
        data: {
          organizationId: secondOrganizationId,
          departmentId: secondDepartment.id,
          firstName: "Audit",
          email: "audit-b@test.invalid",
          username: "audit-b",
          passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
          status: "Active",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await database?.$disconnect();
    await sqlClient?.end();
    if (adminClient) {
      await adminClient.query(`DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`);
      await adminClient.end();
    }
  });

  it("creates the approved table, columns, primary key, foreign keys, types, and indexes", async () => {
    const columns = await sqlClient.query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'activity_logs'
       ORDER BY ordinal_position`,
      [schemaName],
    );
    expect(columns.rows).toEqual([
      { column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "user_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "organization_id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "module", data_type: "character varying", is_nullable: "NO" },
      { column_name: "entity_name", data_type: "character varying", is_nullable: "NO" },
      { column_name: "record_id", data_type: "character varying", is_nullable: "YES" },
      { column_name: "action", data_type: "character varying", is_nullable: "NO" },
      { column_name: "ip_address", data_type: "inet", is_nullable: "YES" },
      { column_name: "user_agent", data_type: "text", is_nullable: "YES" },
      { column_name: "device_info", data_type: "jsonb", is_nullable: "YES" },
      { column_name: "performed_at", data_type: "timestamp with time zone", is_nullable: "NO" },
      { column_name: "remarks", data_type: "text", is_nullable: "YES" },
    ]);

    const constraints = await sqlClient.query<{ constraint_type: string }>(
      `SELECT constraint_type
       FROM information_schema.table_constraints
       WHERE table_schema = $1
         AND table_name = 'activity_logs'
         AND constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
       ORDER BY constraint_type`,
      [schemaName],
    );
    expect(constraints.rows.map(({ constraint_type }) => constraint_type)).toEqual([
      "FOREIGN KEY",
      "FOREIGN KEY",
      "PRIMARY KEY",
    ]);

    const indexes = await sqlClient.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = $1 AND tablename = 'activity_logs'
       ORDER BY indexname`,
      [schemaName],
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "activity_logs_pkey",
        "activity_logs_user_id_performed_at_idx",
        "activity_logs_organization_id_performed_at_idx",
        "activity_logs_module_performed_at_idx",
        "activity_logs_entity_name_record_id_performed_at_idx",
        "activity_logs_performed_at_idx",
      ]),
    );
  });

  it("appends immutable operational metadata and supports all approved queries", async () => {
    const performedAt = new Date("2026-08-27T06:00:00.000Z");
    const record = await service.recordActivity({
      userId,
      organizationId,
      module: "Authentication",
      entityName: "UserSession",
      recordId: "session-reference",
      action: "LoginSucceeded",
      ipAddress: "127.0.0.1",
      userAgent: "Sunshine-Test-Agent/1.0",
      deviceInfo: { platform: "Windows", mobile: false },
      performedAt,
      remarks: "Login succeeded.",
    });

    expect(record).toMatchObject({
      userId,
      organizationId,
      ipAddress: "127.0.0.1",
      userAgent: "Sunshine-Test-Agent/1.0",
      deviceInfo: { platform: "Windows", mobile: false },
    });
    await expect(repository.findByUser(userId, organizationId)).resolves.toContainEqual(record);
    await expect(repository.findByOrganization(organizationId)).resolves.toContainEqual(record);
    await expect(repository.findByModule("Authentication", organizationId)).resolves.toContainEqual(record);
    await expect(repository.findByEntity("UserSession", organizationId)).resolves.toContainEqual(record);
    await expect(repository.findByRecord("UserSession", "session-reference", organizationId)).resolves.toContainEqual(record);
    await expect(
      repository.findByDateRange(
        organizationId,
        new Date("2026-08-27T05:59:00.000Z"),
        new Date("2026-08-27T06:01:00.000Z"),
      ),
    ).resolves.toContainEqual(record);

    expect("update" in repository).toBe(false);
    expect("delete" in repository).toBe(false);
    await expect(database.activityLog.findUnique({ where: { id: record.id } })).resolves.toMatchObject({
      action: "LoginSucceeded",
      remarks: "Login succeeded.",
    });
  });

  it("derives actor and organization from authenticated context and ignores client identity fields", async () => {
    const untrustedInput = {
      context: {
        correlationId: "audit-context",
        userId,
        organizationId,
        sessionId: "session-id",
      },
      userId: secondUserId,
      organizationId: secondOrganizationId,
      module: "Authorization",
      entityName: "Permission",
      recordId: "system.health.read",
      action: "AuthorizationDenied",
      ipAddress: "127.0.0.2",
    } as const;

    const record = await service.recordAuthenticatedActivity(untrustedInput);
    expect(record).toMatchObject({ userId, organizationId });
    expect(record).not.toMatchObject({
      userId: secondUserId,
      organizationId: secondOrganizationId,
    });
  });

  it("rejects credential-shaped fields and values without persisting them", async () => {
    const base: RecordActivityInput = {
      userId,
      organizationId,
      module: "Authentication",
      entityName: "User",
      action: "SecurityEvent",
    };
    const unsafeInputs: readonly RecordActivityInput[] = [
      { ...base, remarks: "password=Plaintext-Password" },
      { ...base, remarks: "password_hash=$2b$12$credential" },
      { ...base, remarks: "access_token=eyJsecret" },
      { ...base, remarks: "refresh_token=opaque-secret" },
      { ...base, remarks: "reset_token=reset-secret" },
      { ...base, remarks: "Authorization: Bearer credential" },
      { ...base, remarks: "cookie=refresh-cookie-secret" },
      { ...base, remarks: "api_key=api-secret" },
      { ...base, remarks: "Bearer header-secret" },
      { ...base, remarks: "eyJhbGciOiJIUzI1NiJ9.payload.signature" },
      { ...base, password: "not-allowed" } as RecordActivityInput,
    ];

    const before = await database.activityLog.count();
    for (const input of unsafeInputs) {
      await expect(service.recordActivity(input)).rejects.toThrow();
    }
    expect(await database.activityLog.count()).toBe(before);
  });

  it("enforces user and organization tenant integrity", async () => {
    await expect(
      repository.append({
        userId: secondUserId,
        organizationId,
        module: "Authorization",
        entityName: "RoleAssignment",
        action: "RoleAssigned",
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});
