import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { Client } from "pg";

import { PrismaClient } from "../../generated/prisma/client.js";

const migrationPath = fileURLToPath(
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
const tenantIntegrityMigrationPath = fileURLToPath(
  new URL(
    "../../../../../prisma/migrations/20260901120000_group_1_tenant_integrity/migration.sql",
    import.meta.url,
  ),
);
const organizationIdDefaultMigrationPath = fileURLToPath(
  new URL(
    "../../../../../prisma/migrations/20260901123000_organization_id_database_default/migration.sql",
    import.meta.url,
  ),
);

const expectedTables = [
  "cities",
  "countries",
  "departments",
  "financial_years",
  "organization_settings",
  "organizations",
  "states",
  "user_sessions",
  "users",
] as const;

const schemaName = `foundation_test_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests.");
}

jest.setTimeout(60_000);

async function expectErrorCode(
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

describe("common and administration database foundation", () => {
  let adminClient: Client;
  let sqlClient: Client;
  let prisma: PrismaClient;

  let countryId: string;
  let stateId: string;
  let cityId: string;
  let organizationId: string;
  let departmentId: string;
  let userId: string;

  beforeAll(async () => {
    adminClient = new Client({ connectionString: databaseUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE SCHEMA ${quotedSchemaName}`);

    const migrationSql = await readFile(migrationPath, "utf8");
    const authenticationMigrationSql = await readFile(
      authenticationMigrationPath,
      "utf8",
    );
    const tenantIntegrityMigrationSql = await readFile(
      tenantIntegrityMigrationPath,
      "utf8",
    );
    const organizationIdDefaultMigrationSql = await readFile(
      organizationIdDefaultMigrationPath,
      "utf8",
    );
    await adminClient.query(`SET search_path TO ${quotedSchemaName}`);
    await adminClient.query(migrationSql);
    await adminClient.query(authenticationMigrationSql);
    await adminClient.query(tenantIntegrityMigrationSql);
    await adminClient.query(organizationIdDefaultMigrationSql);
    await adminClient.query("RESET search_path");

    sqlClient = new Client({
      connectionString: databaseUrl,
      options: `-c search_path=${schemaName}`,
    });
    await sqlClient.connect();

    const adapter = new PrismaPg(
      {
        connectionString: databaseUrl,
      },
      { schema: schemaName },
    );
    prisma = new PrismaClient({ adapter });

    const country = await prisma.country.create({
      data: { code: "IN", name: "India", status: "Active" },
    });
    countryId = country.id;

    const state = await prisma.state.create({
      data: {
        countryId,
        code: "GJ",
        name: "Gujarat",
        status: "Active",
      },
    });
    stateId = state.id;

    const city = await prisma.city.create({
      data: {
        stateId,
        code: "AMD",
        name: "Ahmedabad",
        status: "Active",
      },
    });
    cityId = city.id;

    const organization = await prisma.organization.create({
      data: {
        organizationCode: "SUNSHINE",
        organizationName: "Sunshine Corporation",
        countryId,
        stateId,
        cityId,
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
    departmentId = department.id;

    const user = await prisma.user.create({
      data: {
        organizationId,
        departmentId,
        firstName: "Foundation",
        email: "foundation@sunshine.test",
        username: "foundation",
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
      await adminClient.query(
        `DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`,
      );
      await adminClient.end();
    }
  });

  it("retains exactly the nine approved common and administration foundation tables", async () => {
    const result = await sqlClient.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
       ORDER BY table_name`,
      [schemaName],
    );

    const tableNames = result.rows.map(({ table_name }) => table_name);
    expect(tableNames.filter((tableName) =>
      expectedTables.includes(tableName as (typeof expectedTables)[number]),
    )).toEqual(expectedTables);
    expect(tableNames).not.toContain("SystemCheck");
    expect(tableNames).not.toContain("system_checks");
  });

  it("enforces and exposes the Country to State to City relationships", async () => {
    const state = await prisma.state.findUniqueOrThrow({
      where: { id: stateId },
      include: { country: true },
    });
    const city = await prisma.city.findUniqueOrThrow({
      where: { id: cityId },
      include: { state: true },
    });

    expect(state.country.id).toBe(countryId);
    expect(city.state.id).toBe(stateId);

    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO states
             (id, country_id, code, name, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), randomUUID(), "BAD", "Invalid State", "Active"],
        ),
      "23503",
    );

    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO cities
             (id, state_id, code, name, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), randomUUID(), "BAD", "Invalid City", "Active"],
        ),
      "23503",
    );
  });

  it("links Organization to geography, Department, and User", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: { country: true, state: true, city: true, departments: true },
    });
    const department = await prisma.department.findUniqueOrThrow({
      where: { id: departmentId },
      include: { users: true },
    });

    expect(organization.country?.id).toBe(countryId);
    expect(organization.state?.id).toBe(stateId);
    expect(organization.city?.id).toBe(cityId);
    expect(organization.departments.map(({ id }) => id)).toContain(
      departmentId,
    );
    expect(department.users.map(({ id }) => id)).toContain(userId);
  });

  it("enforces User to Department tenant consistency in the database", async () => {
    const otherOrganization = await prisma.organization.create({
      data: {
        organizationCode: "H3-OTHER",
        organizationName: "H3 Other Organization",
        status: "Active",
      },
    });
    const otherDepartment = await prisma.department.create({
      data: {
        organizationId: otherOrganization.id,
        departmentCode: "H3-DEPT",
        departmentName: "H3 Department",
        status: "Active",
      },
    });

    await expect(
      prisma.user.create({
        data: {
          organizationId: otherOrganization.id,
          departmentId: otherDepartment.id,
          firstName: "Same Tenant",
          email: "h3-same-tenant@sunshine.test",
          username: "h3-same-tenant",
          passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
          status: "Active",
        },
      }),
    ).resolves.toBeDefined();

    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO users
             (id, organization_id, department_id, first_name, email,
              username, password_hash, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            organizationId,
            otherDepartment.id,
            "Cross Tenant",
            "h3-cross-tenant@sunshine.test",
            "h3-cross-tenant",
            "$2b$12$test-only-not-a-real-credential-hash",
            "Active",
          ],
        ),
      "23503",
    );
  });

  it("enforces Organization Settings to Financial Year tenant consistency", async () => {
    const otherOrganization = await prisma.organization.create({
      data: {
        organizationCode: "H4-OTHER",
        organizationName: "H4 Other Organization",
        status: "Active",
      },
    });
    const ownFinancialYear = await prisma.financialYear.create({
      data: {
        organizationId: otherOrganization.id,
        financialYearCode: "H4-OWN",
        financialYearName: "H4 Own Financial Year",
        startDate: new Date("2030-04-01T00:00:00.000Z"),
        endDate: new Date("2031-03-31T00:00:00.000Z"),
        status: "Draft",
      },
    });

    await expect(
      prisma.organizationSetting.create({
        data: {
          organizationId: otherOrganization.id,
          financialYearId: ownFinancialYear.id,
          defaultCurrency: "INR",
          defaultLanguage: "en",
          defaultTimeZone: "Asia/Calcutta",
          dateFormat: "DD-MM-YYYY",
          status: "Active",
        },
      }),
    ).resolves.toBeDefined();

    await expectErrorCode(
      () =>
        sqlClient.query(
          `UPDATE organization_settings
           SET organization_id = $1
           WHERE organization_id = $2`,
          [organizationId, otherOrganization.id],
        ),
      "23503",
    );
  });

  it("enforces the complete Organization geography hierarchy", async () => {
    const otherCountry = await prisma.country.create({
      data: { code: "H5", name: "H5 Country", status: "Active" },
    });
    const otherState = await prisma.state.create({
      data: {
        countryId: otherCountry.id,
        code: "H5",
        name: "H5 State",
        status: "Active",
      },
    });
    const otherCity = await prisma.city.create({
      data: {
        stateId: otherState.id,
        code: "H5",
        name: "H5 City",
        status: "Active",
      },
    });

    await expect(
      prisma.organization.create({
        data: {
          organizationCode: "H5-VALID",
          organizationName: "H5 Valid Organization",
          countryId: otherCountry.id,
          stateId: otherState.id,
          cityId: otherCity.id,
          status: "Active",
        },
      }),
    ).resolves.toBeDefined();

    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO organizations
             (id, organization_code, organization_name, country_id, state_id, city_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            "H5-BAD-CITY",
            "H5 Invalid City Organization",
            countryId,
            stateId,
            otherCity.id,
            "Active",
          ],
        ),
      "23503",
    );

    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO organizations
             (id, organization_code, organization_name, country_id, state_id, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            "H5-BAD-STATE",
            "H5 Invalid State Organization",
            countryId,
            otherState.id,
            "Active",
          ],
        ),
      "23503",
    );

    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO organizations
             (id, organization_code, organization_name, country_id, city_id, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            "H5-MISSING-STATE",
            "H5 Missing State Organization",
            otherCountry.id,
            otherCity.id,
            "Active",
          ],
        ),
      "23514",
    );
  });

  it("supports nullable bootstrap audit relationships", async () => {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });
    const department = await prisma.department.findUniqueOrThrow({
      where: { id: departmentId },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    expect(organization.createdById).toBeNull();
    expect(organization.updatedById).toBeNull();
    expect(department.createdById).toBeNull();
    expect(department.updatedById).toBeNull();
    expect(user.createdById).toBeNull();
    expect(user.updatedById).toBeNull();
  });

  it("enforces same-tenant common-foundation audit actors", async () => {
    const otherOrganization = await prisma.organization.create({
      data: {
        organizationCode: "H6-OTHER",
        organizationName: "H6 Other Organization",
        status: "Active",
      },
    });
    const otherDepartment = await prisma.department.create({
      data: {
        organizationId: otherOrganization.id,
        departmentCode: "H6-DEPT",
        departmentName: "H6 Department",
        status: "Active",
      },
    });
    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrganization.id,
        departmentId: otherDepartment.id,
        firstName: "H6 Actor",
        email: "h6-actor@sunshine.test",
        username: "h6-actor",
        passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
        status: "Active",
      },
    });
    const financialYear = await prisma.financialYear.create({
      data: {
        organizationId: otherOrganization.id,
        financialYearCode: "H6-FY",
        financialYearName: "H6 Financial Year",
        startDate: new Date("2032-04-01T00:00:00.000Z"),
        endDate: new Date("2033-03-31T00:00:00.000Z"),
        status: "Draft",
      },
    });
    const setting = await prisma.organizationSetting.create({
      data: {
        organizationId: otherOrganization.id,
        financialYearId: financialYear.id,
        defaultCurrency: "INR",
        defaultLanguage: "en",
        defaultTimeZone: "Asia/Calcutta",
        dateFormat: "DD-MM-YYYY",
        status: "Active",
      },
    });

    await prisma.organization.update({
      where: { id: otherOrganization.id },
      data: { createdById: otherUser.id, updatedById: otherUser.id },
    });
    await prisma.department.update({
      where: { id: otherDepartment.id },
      data: { createdById: otherUser.id, updatedById: otherUser.id },
    });
    await prisma.user.update({
      where: { id: otherUser.id },
      data: { createdById: otherUser.id, updatedById: otherUser.id },
    });
    await prisma.financialYear.update({
      where: { id: financialYear.id },
      data: { createdById: otherUser.id, updatedById: otherUser.id },
    });
    await prisma.organizationSetting.update({
      where: { id: setting.id },
      data: { createdById: otherUser.id, updatedById: otherUser.id },
    });

    const crossTenantUpdates = [
      `UPDATE organizations SET created_by = $1 WHERE id = $2`,
      `UPDATE organizations SET updated_by = $1 WHERE id = $2`,
      `UPDATE departments SET created_by = $1 WHERE id = $2`,
      `UPDATE departments SET updated_by = $1 WHERE id = $2`,
      `UPDATE users SET created_by = $1 WHERE id = $2`,
      `UPDATE users SET updated_by = $1 WHERE id = $2`,
      `UPDATE financial_years SET created_by = $1 WHERE id = $2`,
      `UPDATE financial_years SET updated_by = $1 WHERE id = $2`,
      `UPDATE organization_settings SET created_by = $1 WHERE id = $2`,
      `UPDATE organization_settings SET updated_by = $1 WHERE id = $2`,
    ] as const;
    const recordIds = [
      otherOrganization.id,
      otherOrganization.id,
      otherDepartment.id,
      otherDepartment.id,
      otherUser.id,
      otherUser.id,
      financialYear.id,
      financialYear.id,
      setting.id,
      setting.id,
    ] as const;

    for (const [index, query] of crossTenantUpdates.entries()) {
      await expectErrorCode(
        () => sqlClient.query(query, [userId, recordIds[index]]),
        "23503",
      );
    }
  });

  it("enforces organization-scoped username and email uniqueness", async () => {
    const otherOrganization = await prisma.organization.create({
      data: {
        organizationCode: "SECOND",
        organizationName: "Second Organization",
        status: "Active",
      },
    });
    const otherDepartment = await prisma.department.create({
      data: {
        organizationId: otherOrganization.id,
        departmentCode: "ADMIN",
        departmentName: "Administration",
        status: "Active",
      },
    });

    await expect(
      prisma.user.create({
        data: {
          organizationId: otherOrganization.id,
          departmentId: otherDepartment.id,
          firstName: "Other",
          email: "foundation@sunshine.test",
          username: "foundation",
          passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
          status: "Active",
        },
      }),
    ).resolves.toBeDefined();

    await expectErrorCode(
      () =>
        prisma.user.create({
          data: {
            organizationId,
            departmentId,
            firstName: "Duplicate Username",
            email: "different@sunshine.test",
            username: "foundation",
            passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
            status: "Active",
          },
        }),
      "P2002",
    );

    await expectErrorCode(
      () =>
        prisma.user.create({
          data: {
            organizationId,
            departmentId,
            firstName: "Duplicate Email",
            email: "foundation@sunshine.test",
            username: "different",
            passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
            status: "Active",
          },
        }),
      "P2002",
    );
  });

  it("enforces Department code and name uniqueness within an Organization", async () => {
    await expectErrorCode(
      () =>
        prisma.department.create({
          data: {
            organizationId,
            departmentCode: "ADMIN",
            departmentName: "Different Name",
            status: "Active",
          },
        }),
      "P2002",
    );

    await expectErrorCode(
      () =>
        prisma.department.create({
          data: {
            organizationId,
            departmentCode: "DIFFERENT",
            departmentName: "Administration",
            status: "Active",
          },
        }),
      "P2002",
    );
  });

  it("enforces Financial Year date and single-Active constraints", async () => {
    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO financial_years
             (id, organization_id, financial_year_code, financial_year_name,
              start_date, end_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            organizationId,
            "INVALID",
            "Invalid Financial Year",
            "2026-04-01",
            "2026-03-31",
            "Draft",
          ],
        ),
      "23514",
    );

    await prisma.financialYear.create({
      data: {
        organizationId,
        financialYearCode: "FY-2026",
        financialYearName: "Financial Year 2026-27",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "Active",
      },
    });

    await expectErrorCode(
      () =>
        prisma.financialYear.create({
          data: {
            organizationId,
            financialYearCode: "FY-2027",
            financialYearName: "Financial Year 2027-28",
            startDate: new Date("2027-04-01T00:00:00.000Z"),
            endDate: new Date("2028-03-31T00:00:00.000Z"),
            status: "Active",
          },
        }),
      "P2002",
    );
  });

  it("prevents overlapping Financial Years within one Organization", async () => {
    const otherOrganization = await prisma.organization.create({
      data: {
        organizationCode: "H7-OTHER",
        organizationName: "H7 Other Organization",
        status: "Active",
      },
    });

    await prisma.financialYear.create({
      data: {
        organizationId,
        financialYearCode: "H7-BASE",
        financialYearName: "H7 Base Financial Year",
        startDate: new Date("2040-04-01T00:00:00.000Z"),
        endDate: new Date("2041-03-31T00:00:00.000Z"),
        status: "Draft",
      },
    });

    await expect(
      prisma.financialYear.create({
        data: {
          organizationId,
          financialYearCode: "H7-ADJACENT",
          financialYearName: "H7 Adjacent Financial Year",
          startDate: new Date("2041-04-01T00:00:00.000Z"),
          endDate: new Date("2042-03-31T00:00:00.000Z"),
          status: "Draft",
        },
      }),
    ).resolves.toBeDefined();

    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO financial_years
             (id, organization_id, financial_year_code, financial_year_name,
              start_date, end_date, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            organizationId,
            "H7-OVERLAP",
            "H7 Overlapping Financial Year",
            "2041-01-01",
            "2041-12-31",
            "Draft",
          ],
        ),
      "23P01",
    );

    await expect(
      prisma.financialYear.create({
        data: {
          organizationId: otherOrganization.id,
          financialYearCode: "H7-SAME-DATES",
          financialYearName: "H7 Same Dates Other Tenant",
          startDate: new Date("2040-04-01T00:00:00.000Z"),
          endDate: new Date("2041-03-31T00:00:00.000Z"),
          status: "Draft",
        },
      }),
    ).resolves.toBeDefined();
  });

  it("enforces one Organization Settings record per Organization", async () => {
    await prisma.organizationSetting.create({
      data: {
        organizationId,
        defaultCurrency: "INR",
        defaultLanguage: "en",
        defaultTimeZone: "Asia/Calcutta",
        dateFormat: "DD-MM-YYYY",
        status: "Active",
      },
    });

    await expectErrorCode(
      () =>
        prisma.organizationSetting.create({
          data: {
            organizationId,
            defaultCurrency: "INR",
            defaultLanguage: "en",
            defaultTimeZone: "Asia/Calcutta",
            dateFormat: "YYYY-MM-DD",
            status: "Inactive",
          },
        }),
      "P2002",
    );
  });

  it("links User Session to User and enforces hash uniqueness", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const sessionId = randomUUID();
    await sqlClient.query(
      `INSERT INTO user_sessions
         (id, organization_id, user_id, session_token_hash, expires_at, ip_address, device_info, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sessionId,
        organizationId,
        userId,
        "sha256:test-session-hash",
        expiresAt,
        "127.0.0.1",
        { type: "integration-test" },
        "Active",
      ],
    );

    const session = await sqlClient.query<{ user_id: string }>(
      "SELECT user_id FROM user_sessions WHERE id = $1",
      [sessionId],
    );
    expect(session.rows[0]?.user_id).toBe(userId);

    await expectErrorCode(
      () =>
        sqlClient.query(
          `INSERT INTO user_sessions
             (id, organization_id, user_id, session_token_hash, expires_at, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            randomUUID(),
            organizationId,
            userId,
            "sha256:test-session-hash",
            expiresAt,
            "Active",
          ],
        ),
      "23505",
    );
  });
});
