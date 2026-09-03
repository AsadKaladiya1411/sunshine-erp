import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Client } from "pg";

import { ActivityLogRepository } from "../../core/audit/activity-log.repository.js";
import { AuditService } from "../../core/audit/audit.service.js";
import { SECURITY_ACTIVITY_ACTIONS } from "../../core/audit/activity-log.types.js";
import { accessTokenService } from "../../core/auth/access-token.service.js";
import { passwordResetTokenService } from "../../core/auth/password-reset-token.service.js";
import { PasswordService } from "../../core/auth/password.service.js";
import { refreshTokenService } from "../../core/auth/refresh-token.service.js";
import { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { AuthRepository } from "../auth/repositories/auth.repository.js";
import { AuthenticationService } from "../auth/services/authentication.service.js";
import { SessionService } from "../auth/services/session.service.js";
import { PermissionRepository } from "../authorization/repositories/permission.repository.js";
import { RolePermissionRepository } from "../authorization/repositories/role-permission.repository.js";
import { RoleRepository } from "../authorization/repositories/role.repository.js";
import { UserRoleAssignmentRepository } from "../authorization/repositories/user-role-assignment.repository.js";
import { AuthorizationAdministrationService } from "../authorization/services/authorization-administration.service.js";
import { AuthorizationService } from "../authorization/services/authorization.service.js";
import {
  INITIAL_ADMINISTRATION_PERMISSION,
  INITIAL_ADMINISTRATOR_ROLE,
  type FirstTenantBootstrapInput,
} from "./bootstrap.types.js";
import { BootstrapNotAllowedError } from "./bootstrap.errors.js";
import {
  BootstrapRepository,
  type BootstrapTransaction,
} from "./repositories/bootstrap.repository.js";
import { BootstrapService } from "./services/bootstrap.service.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests.");
}

const migrationsDirectory = fileURLToPath(
  new URL("../../../../../prisma/migrations/", import.meta.url),
);
const schemaName = `h15_bootstrap_test_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;
const administratorPassword = "Bootstrap-Administrator-2026";

jest.setTimeout(240_000);

interface TestServices {
  readonly bootstrap: BootstrapService;
  readonly authorizationAdministration: AuthorizationAdministrationService;
  readonly authorization: AuthorizationService;
  readonly passwords: PasswordService;
}

function bootstrapInput(suffix = "ONE"): FirstTenantBootstrapInput {
  return {
    organizationCode: `BOOT-${suffix}`,
    organizationName: `Bootstrap Organization ${suffix}`,
    departmentCode: "ADMIN",
    departmentName: "Administration",
    administratorFirstName: "Initial",
    administratorLastName: "Administrator",
    administratorUsername: `admin-${suffix.toLowerCase()}`,
    administratorEmail: `admin-${suffix.toLowerCase()}@bootstrap.test`,
    password: administratorPassword,
  };
}

class FailingAfterAdministratorRepository extends BootstrapRepository {
  override async createAdministrator(
    input: Parameters<BootstrapRepository["createAdministrator"]>[0],
    transaction: BootstrapTransaction,
  ): Promise<{ readonly id: string }> {
    await super.createAdministrator(input, transaction);
    throw new Error("Forced bootstrap administrator-stage failure.");
  }
}

class FailingAfterAuthorizationService extends AuthorizationAdministrationService {
  override async provisionInitialAdministration(
    input: Parameters<
      AuthorizationAdministrationService["provisionInitialAdministration"]
    >[0],
    database: Prisma.TransactionClient,
  ): Promise<never> {
    await super.provisionInitialAdministration(input, database);
    throw new Error("Forced bootstrap authorization-stage failure.");
  }
}

class ConcurrentStartBarrier {
  private arrivals = 0;
  private release: (() => void) | undefined;
  private readonly ready = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  async arrive(): Promise<void> {
    this.arrivals += 1;
    if (this.arrivals === 2) {
      this.release?.();
    }
    await this.ready;
  }
}

class SynchronizedBootstrapRepository extends BootstrapRepository {
  constructor(
    database: PrismaClient,
    private readonly barrier: ConcurrentStartBarrier,
  ) {
    super(database);
  }

  override async runExclusive<TResult>(
    operation: (transaction: BootstrapTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    await this.barrier.arrive();
    return super.runExclusive(operation);
  }
}

describe("H15 first-tenant bootstrap", () => {
  let adminClient: Client;
  let database: PrismaClient;
  let tableNames: readonly string[];

  beforeAll(async () => {
    adminClient = new Client({ connectionString: databaseUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE SCHEMA ${quotedSchemaName}`);
    await adminClient.query(`SET search_path TO ${quotedSchemaName}`);

    const migrationDirectories = (
      await readdir(migrationsDirectory, {
        withFileTypes: true,
      })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const migrationDirectory of migrationDirectories) {
      const migration = await readFile(
        `${migrationsDirectory}/${migrationDirectory}/migration.sql`,
        "utf8",
      );
      await adminClient.query(migration);
    }
    await adminClient.query("RESET search_path");

    const tables = await adminClient.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      [schemaName],
    );
    tableNames = tables.rows.map(({ table_name }) => table_name);
    database = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: databaseUrl },
        { schema: schemaName },
      ),
    });
  });

  beforeEach(async () => {
    if (tableNames.length > 0) {
      const qualifiedTables = tableNames
        .map((tableName) => `${quotedSchemaName}."${tableName}"`)
        .join(", ");
      await adminClient.query(`TRUNCATE TABLE ${qualifiedTables} CASCADE`);
    }
  });

  afterAll(async () => {
    await database?.$disconnect();
    if (adminClient) {
      await adminClient.query(
        `DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`,
      );
      await adminClient.end();
    }
  });

  function createServices(
    repository: BootstrapRepository = new BootstrapRepository(database),
    authorizationOverride?: AuthorizationAdministrationService,
  ): TestServices {
    const passwords = new PasswordService({
      minimumLength: 12,
      bcryptCost: 10,
      historyDepth: 5,
    });
    const audit = new AuditService(new ActivityLogRepository(database));
    const roles = new RoleRepository(database);
    const permissions = new PermissionRepository(database);
    const rolePermissions = new RolePermissionRepository(database);
    const assignments = new UserRoleAssignmentRepository(database);
    const authorizationAdministration =
      authorizationOverride ??
      new AuthorizationAdministrationService(
        permissions,
        rolePermissions,
        assignments,
        audit,
        roles,
      );
    return {
      bootstrap: new BootstrapService(
        repository,
        passwords,
        authorizationAdministration,
        audit,
      ),
      authorizationAdministration,
      authorization: new AuthorizationService(assignments, assignments),
      passwords,
    };
  }

  async function currentBootstrapCounts(): Promise<Record<string, number>> {
    const [
      organizations,
      departments,
      users,
      settings,
      roles,
      permissions,
      rolePermissions,
      roleAssignments,
      sessions,
      activityLogs,
    ] = await Promise.all([
      database.organization.count(),
      database.department.count(),
      database.user.count(),
      database.organizationSetting.count(),
      database.role.count(),
      database.permission.count(),
      database.rolePermission.count(),
      database.roleAssignment.count(),
      database.userSession.count(),
      database.activityLog.count(),
    ]);
    return {
      organizations,
      departments,
      users,
      settings,
      roles,
      permissions,
      rolePermissions,
      roleAssignments,
      sessions,
      activityLogs,
    };
  }

  it("atomically creates the first tenant, administrator, RBAC, audit, and a usable login", async () => {
    const services = createServices();
    const input = bootstrapInput();
    const result = await services.bootstrap.bootstrapFirstTenant(input);

    await expect(currentBootstrapCounts()).resolves.toEqual({
      organizations: 1,
      departments: 1,
      users: 1,
      settings: 0,
      roles: 1,
      permissions: 1,
      rolePermissions: 1,
      roleAssignments: 1,
      sessions: 0,
      activityLogs: 7,
    });
    const user = await database.user.findUniqueOrThrow({
      where: { id: result.administratorUserId },
    });
    expect(user.organizationId).toBe(result.organizationId);
    expect(user.departmentId).toBe(result.departmentId);
    expect(user.passwordHash).not.toBe(administratorPassword);
    await expect(
      services.passwords.verify(administratorPassword, user.passwordHash),
    ).resolves.toBe(true);
    expect(JSON.stringify(result)).not.toContain(administratorPassword);
    expect(JSON.stringify(result)).not.toContain(user.passwordHash);

    await expect(
      database.role.findUniqueOrThrow({ where: { id: result.roleId } }),
    ).resolves.toMatchObject({
      organizationId: result.organizationId,
      roleCode: INITIAL_ADMINISTRATOR_ROLE.code,
      roleName: INITIAL_ADMINISTRATOR_ROLE.name,
      status: "Active",
    });
    await expect(
      database.permission.findUniqueOrThrow({
        where: { id: result.permissionId },
      }),
    ).resolves.toMatchObject({
      permissionCode: INITIAL_ADMINISTRATION_PERMISSION.code,
      module: INITIAL_ADMINISTRATION_PERMISSION.module,
      resource: INITIAL_ADMINISTRATION_PERMISSION.resource,
      action: INITIAL_ADMINISTRATION_PERMISSION.action,
      status: "Active",
    });
    const bootstrapAuditRecords = await database.activityLog.findMany({
      orderBy: { action: "asc" },
    });
    expect(bootstrapAuditRecords.map(({ action }) => action)).toEqual(
      [
        SECURITY_ACTIVITY_ACTIONS.bootstrapAdministratorCreated,
        SECURITY_ACTIVITY_ACTIONS.bootstrapDepartmentCreated,
        SECURITY_ACTIVITY_ACTIONS.bootstrapOrganizationCreated,
        SECURITY_ACTIVITY_ACTIONS.permissionCreated,
        SECURITY_ACTIVITY_ACTIONS.roleAssigned,
        SECURITY_ACTIVITY_ACTIONS.roleCreated,
        SECURITY_ACTIVITY_ACTIONS.rolePermissionAssigned,
      ].sort(),
    );
    expect(
      bootstrapAuditRecords.every(
        ({ organizationId, userId }) =>
          organizationId === result.organizationId &&
          userId === result.administratorUserId,
      ),
    ).toBe(true);

    const authRepository = new AuthRepository(database);
    const audit = new AuditService(new ActivityLogRepository(database));
    const authentication = new AuthenticationService(
      authRepository,
      services.passwords,
      accessTokenService,
      refreshTokenService,
      new SessionService(authRepository),
      passwordResetTokenService,
      audit,
    );
    const login = await authentication.login({
      organizationCode: input.organizationCode,
      username: input.administratorUsername,
      password: administratorPassword,
    });
    expect(login.user).toMatchObject({
      userId: result.administratorUserId,
      organizationId: result.organizationId,
      organizationCode: input.organizationCode,
      username: input.administratorUsername,
    });
    await expect(database.userSession.count()).resolves.toBe(1);
    await expect(
      services.authorization.hasPermission(
        result.administratorUserId,
        result.organizationId,
        INITIAL_ADMINISTRATION_PERMISSION.code,
      ),
    ).resolves.toBe(true);

    const auditText = JSON.stringify(await database.activityLog.findMany());
    expect(auditText).not.toContain(administratorPassword);
    expect(auditText).not.toContain(user.passwordHash);
  });

  it("rolls back all records when foundation creation fails after the user write", async () => {
    const services = createServices(
      new FailingAfterAdministratorRepository(database),
    );
    await expect(
      services.bootstrap.bootstrapFirstTenant(bootstrapInput()),
    ).rejects.toThrow("Forced bootstrap administrator-stage failure.");
    await expect(currentBootstrapCounts()).resolves.toEqual({
      organizations: 0,
      departments: 0,
      users: 0,
      settings: 0,
      roles: 0,
      permissions: 0,
      rolePermissions: 0,
      roleAssignments: 0,
      sessions: 0,
      activityLogs: 0,
    });
  });

  it("rolls back security mutations and audit records when authorization fails", async () => {
    const audit = new AuditService(new ActivityLogRepository(database));
    const failingAuthorization = new FailingAfterAuthorizationService(
      new PermissionRepository(database),
      new RolePermissionRepository(database),
      new UserRoleAssignmentRepository(database),
      audit,
      new RoleRepository(database),
    );
    const services = createServices(
      new BootstrapRepository(database),
      failingAuthorization,
    );
    await expect(
      services.bootstrap.bootstrapFirstTenant(bootstrapInput()),
    ).rejects.toThrow("Forced bootstrap authorization-stage failure.");
    expect(
      Object.values(await currentBootstrapCounts()).every(
        (count) => count === 0,
      ),
    ).toBe(true);
  });

  it("rejects every later bootstrap attempt without mutation", async () => {
    const services = createServices();
    await services.bootstrap.bootstrapFirstTenant(bootstrapInput());
    const before = await currentBootstrapCounts();
    await expect(
      services.bootstrap.bootstrapFirstTenant(bootstrapInput("TWO")),
    ).rejects.toBeInstanceOf(BootstrapNotAllowedError);
    await expect(currentBootstrapCounts()).resolves.toEqual(before);
  });

  it("serializes simultaneous executions so exactly one distinct tenant can commit", async () => {
    const barrier = new ConcurrentStartBarrier();
    const repository = new SynchronizedBootstrapRepository(database, barrier);
    const first = createServices(repository).bootstrap.bootstrapFirstTenant(
      bootstrapInput("RACE-A"),
    );
    const second = createServices(repository).bootstrap.bootstrapFirstTenant(
      bootstrapInput("RACE-B"),
    );
    const results = await Promise.allSettled([first, second]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    const rejection = results.find(({ status }) => status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.any(BootstrapNotAllowedError),
    });
    await expect(currentBootstrapCounts()).resolves.toEqual({
      organizations: 1,
      departments: 1,
      users: 1,
      settings: 0,
      roles: 1,
      permissions: 1,
      rolePermissions: 1,
      roleAssignments: 1,
      sessions: 0,
      activityLogs: 7,
    });
  });

  it("fails closed when organization state already exists", async () => {
    await database.organization.create({
      data: {
        organizationCode: "PARTIAL",
        organizationName: "Partial Organization",
        status: "Active",
      },
    });
    await expect(
      createServices().bootstrap.bootstrapFirstTenant(bootstrapInput()),
    ).rejects.toBeInstanceOf(BootstrapNotAllowedError);
    await expect(database.organization.count()).resolves.toBe(1);
    await expect(database.user.count()).resolves.toBe(0);
    await expect(database.role.count()).resolves.toBe(0);
  });

  it("fails closed when global security state already exists", async () => {
    await database.permission.create({
      data: {
        permissionCode: "existing.security",
        permissionName: "Existing security state",
        module: "Existing",
        action: "read",
        status: "Active",
      },
    });
    await expect(
      createServices().bootstrap.bootstrapFirstTenant(bootstrapInput()),
    ).rejects.toBeInstanceOf(BootstrapNotAllowedError);
    await expect(database.permission.count()).resolves.toBe(1);
    await expect(database.organization.count()).resolves.toBe(0);
    await expect(database.user.count()).resolves.toBe(0);
  });

  it("preserves tenant isolation for role and permission assignments", async () => {
    const services = createServices();
    const result =
      await services.bootstrap.bootstrapFirstTenant(bootstrapInput());
    const otherOrganization = await database.organization.create({
      data: {
        organizationCode: "OTHER",
        organizationName: "Other Organization",
        status: "Active",
      },
    });
    const otherDepartment = await database.department.create({
      data: {
        organizationId: otherOrganization.id,
        departmentCode: "ADMIN",
        departmentName: "Administration",
        status: "Active",
      },
    });
    const otherUser = await database.user.create({
      data: {
        organizationId: otherOrganization.id,
        departmentId: otherDepartment.id,
        firstName: "Other",
        username: "other-admin",
        email: "other-admin@bootstrap.test",
        passwordHash: await services.passwords.hash(administratorPassword),
        status: "Active",
      },
    });

    await expect(
      services.authorizationAdministration.assignRoleToUser({
        organizationId: result.organizationId,
        userId: otherUser.id,
        roleId: result.roleId,
        createdById: result.administratorUserId,
      }),
    ).resolves.toBeNull();
    await expect(
      services.authorizationAdministration.assignPermissionToRole({
        organizationId: result.organizationId,
        roleId: result.roleId,
        permissionId: result.permissionId,
        assignedById: otherUser.id,
      }),
    ).resolves.toBeNull();
    await expect(
      database.roleAssignment.create({
        data: {
          organizationId: result.organizationId,
          userId: otherUser.id,
          roleId: result.roleId,
          status: "Active",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(database.roleAssignment.count()).resolves.toBe(1);
  });
});
