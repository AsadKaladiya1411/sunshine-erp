import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { Client } from "pg";

import { PrismaClient } from "../../generated/prisma/client.js";
import { ActivityLogRepository } from "../audit/activity-log.repository.js";
import { AuditService } from "../audit/audit.service.js";
import { PermissionRepository } from "../../modules/authorization/repositories/permission.repository.js";
import { RolePermissionRepository } from "../../modules/authorization/repositories/role-permission.repository.js";
import { RoleRepository } from "../../modules/authorization/repositories/role.repository.js";
import { UserRoleAssignmentRepository } from "../../modules/authorization/repositories/user-role-assignment.repository.js";
import { AuthorizationService } from "../../modules/authorization/services/authorization.service.js";

const migrationPaths = [
  "../../../../../prisma/migrations/20260825150000_common_administration_foundation/migration.sql",
  "../../../../../prisma/migrations/20260825220000_authentication_foundation/migration.sql",
  "../../../../../prisma/migrations/20260827052012_rbac_authorization/migration.sql",
  "../../../../../prisma/migrations/20260827090000_rbac_source_compliance/migration.sql",
  "../../../../../prisma/migrations/20260827120000_activity_logs/migration.sql",
].map((migrationPath) =>
  fileURLToPath(new URL(migrationPath, import.meta.url)),
);

const schemaName = `rbac_foundation_test_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests.");
}

jest.setTimeout(90_000);

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

describe("RBAC database and authorization foundation", () => {
  let adminClient: Client;
  let sqlClient: Client;
  let database: PrismaClient;
  let roles: RoleRepository;
  let permissions: PermissionRepository;
  let rolePermissions: RolePermissionRepository;
  let assignments: UserRoleAssignmentRepository;
  let authorization: AuthorizationService;

  let organizationAId: string;
  let organizationBId: string;
  let actorAId: string;
  let userAId: string;
  let userBId: string;
  let historyUserId: string;
  let expiredUserId: string;
  let timedExpiredUserId: string;
  let inactiveUserId: string;
  let roleAId: string;
  let secondRoleAId: string;
  let roleBId: string;
  let readPermissionId: string;
  let writePermissionId: string;
  let inactivePermissionId: string;

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
    roles = new RoleRepository(database);
    permissions = new PermissionRepository(database);
    rolePermissions = new RolePermissionRepository(database);
    assignments = new UserRoleAssignmentRepository(database);
    authorization = new AuthorizationService(assignments);

    const organizationA = await database.organization.create({
      data: {
        id: randomUUID(),
        organizationCode: "RBAC-A",
        organizationName: "RBAC Organization A",
        status: "Active",
      },
    });
    const organizationB = await database.organization.create({
      data: {
        id: randomUUID(),
        organizationCode: "RBAC-B",
        organizationName: "RBAC Organization B",
        status: "Active",
      },
    });
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;
    const departmentA = await database.department.create({
      data: {
        organizationId: organizationAId,
        departmentCode: "ADMIN",
        departmentName: "Administration",
        status: "Active",
      },
    });
    const departmentB = await database.department.create({
      data: {
        organizationId: organizationBId,
        departmentCode: "ADMIN",
        departmentName: "Administration",
        status: "Active",
      },
    });
    const createUser = async (
      organizationId: string,
      departmentId: string,
      username: string,
    ) =>
      database.user.create({
        data: {
          organizationId,
          departmentId,
          firstName: username,
          email: `${username}@rbac.test`,
          username,
          passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
          status: "Active",
        },
      });

    actorAId = (
      await createUser(organizationAId, departmentA.id, "rbac-actor-a")
    ).id;
    userAId = (await createUser(organizationAId, departmentA.id, "rbac-user-a"))
      .id;
    userBId = (await createUser(organizationBId, departmentB.id, "rbac-user-b"))
      .id;
    historyUserId = (
      await createUser(organizationAId, departmentA.id, "rbac-history")
    ).id;
    expiredUserId = (
      await createUser(organizationAId, departmentA.id, "rbac-expired")
    ).id;
    timedExpiredUserId = (
      await createUser(organizationAId, departmentA.id, "rbac-timed-expired")
    ).id;
    inactiveUserId = (
      await createUser(organizationAId, departmentA.id, "rbac-inactive")
    ).id;

    roleAId = (
      await roles.create({
        organizationId: organizationAId,
        roleCode: "OPERATIONS",
        roleName: "Operations",
        status: "Active",
        createdById: actorAId,
      })
    ).id;
    secondRoleAId = (
      await roles.create({
        organizationId: organizationAId,
        roleCode: "AUDIT",
        roleName: "Audit",
        status: "Active",
        createdById: actorAId,
      })
    ).id;
    roleBId = (
      await roles.create({
        organizationId: organizationBId,
        roleCode: "OPERATIONS",
        roleName: "Operations",
        status: "Active",
      })
    ).id;

    readPermissionId = (
      await permissions.create({
        permissionCode: "system.health.read",
        permissionName: "Read system health",
        module: "system",
        resource: "health",
        action: "read",
        status: "Active",
        createdById: actorAId,
      })
    ).id;
    writePermissionId = (
      await permissions.create({
        permissionCode: "system.health.manage",
        permissionName: "Manage system health",
        module: "system",
        action: "manage",
        status: "Active",
        createdById: actorAId,
      })
    ).id;
    inactivePermissionId = (
      await permissions.create({
        permissionCode: "system.disabled.read",
        permissionName: "Disabled permission",
        module: "system",
        action: "read",
        status: "Inactive",
        createdById: actorAId,
      })
    ).id;

    await rolePermissions.assign({
      organizationId: organizationAId,
      roleId: roleAId,
      permissionId: readPermissionId,
      assignedById: actorAId,
    });
    await rolePermissions.assign({
      organizationId: organizationAId,
      roleId: roleAId,
      permissionId: inactivePermissionId,
      assignedById: actorAId,
    });
    await rolePermissions.assign({
      organizationId: organizationAId,
      roleId: secondRoleAId,
      permissionId: writePermissionId,
      assignedById: actorAId,
    });
    await assignments.assign({
      organizationId: organizationAId,
      userId: userAId,
      roleId: roleAId,
      createdById: actorAId,
    });
  });

  afterAll(async () => {
    await database?.$disconnect();
    await sqlClient?.end();
    if (adminClient) {
      await adminClient.query(
        `DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`,
      );
      await adminClient.end();
    }
  });

  it("adds exactly the four approved RBAC tables", async () => {
    const result = await sqlClient.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1
         AND table_name IN ('roles', 'permissions', 'role_permissions', 'role_assignments')
       ORDER BY table_name`,
      [schemaName],
    );
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      "permissions",
      "role_assignments",
      "role_permissions",
      "roles",
    ]);

    const rolePermissionColumns = await sqlClient.query<{
      column_name: string;
    }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'role_permissions'`,
      [schemaName],
    );
    expect(
      rolePermissionColumns.rows.map(({ column_name }) => column_name),
    ).not.toContain("user_id");

    const correctedColumns = await sqlClient.query<{
      table_name: string;
      column_name: string;
      is_nullable: "YES" | "NO";
      column_default: string | null;
    }>(
      `SELECT table_name, column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = $1
         AND (table_name, column_name) IN (
           ('permissions', 'resource'),
           ('role_assignments', 'assigned_at'),
           ('role_assignments', 'expires_at')
         )
       ORDER BY table_name, column_name`,
      [schemaName],
    );
    expect(correctedColumns.rows).toEqual([
      {
        table_name: "permissions",
        column_name: "resource",
        is_nullable: "YES",
        column_default: null,
      },
      expect.objectContaining({
        table_name: "role_assignments",
        column_name: "assigned_at",
        is_nullable: "NO",
        column_default: "CURRENT_TIMESTAMP",
      }),
      {
        table_name: "role_assignments",
        column_name: "expires_at",
        is_nullable: "YES",
        column_default: null,
      },
    ]);
  });

  it("enforces organization-scoped Role identity and global Permission code uniqueness", async () => {
    await expectDatabaseError(
      () =>
        roles.create({
          organizationId: organizationAId,
          roleCode: "OPERATIONS",
          roleName: "Different role name",
          status: "Active",
        }),
      "P2002",
    );
    await expectDatabaseError(
      () =>
        roles.create({
          organizationId: organizationAId,
          roleCode: "DIFFERENT",
          roleName: "Operations",
          status: "Active",
        }),
      "P2002",
    );
    await expectDatabaseError(
      () =>
        permissions.create({
          permissionCode: "system.health.read",
          permissionName: "Duplicate",
          module: "system",
          action: "read",
          status: "Active",
        }),
      "P2002",
    );
    await expect(
      roles.findById(roleBId, organizationBId),
    ).resolves.toMatchObject({
      roleCode: "OPERATIONS",
    });
  });

  it("stores and reads the optional Permission resource", async () => {
    await expect(permissions.findById(readPermissionId)).resolves.toMatchObject(
      {
        resource: "health",
      },
    );
    await expect(permissions.list("health")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: readPermissionId,
          resource: "health",
        }),
      ]),
    );
  });

  it("prevents cross-organization assignments at repository and FK boundaries", async () => {
    await expect(
      assignments.assign({
        organizationId: organizationAId,
        userId: userAId,
        roleId: roleBId,
        createdById: actorAId,
      }),
    ).resolves.toBeNull();
    await expect(
      rolePermissions.assign({
        organizationId: organizationBId,
        roleId: roleBId,
        permissionId: readPermissionId,
        assignedById: actorAId,
      }),
    ).resolves.toBeNull();
    await expectDatabaseError(
      () =>
        database.roleAssignment.create({
          data: {
            organizationId: organizationAId,
            userId: userBId,
            roleId: roleAId,
            status: "Active",
          },
        }),
      "P2003",
    );
    await expect(
      authorization.hasPermission(
        userAId,
        organizationBId,
        "system.health.read",
      ),
    ).resolves.toBe(false);
  });

  it("prevents duplicate Role-Permission rows while reusing Permission across Roles", async () => {
    await expectDatabaseError(
      () =>
        database.rolePermission.create({
          data: {
            roleId: roleAId,
            permissionId: readPermissionId,
            assignedById: actorAId,
            status: "Active",
          },
        }),
      "P2002",
    );
    const assignment = await rolePermissions.assign({
      organizationId: organizationAId,
      roleId: secondRoleAId,
      permissionId: readPermissionId,
      assignedById: actorAId,
    });
    expect(assignment).toMatchObject({ status: "Active" });
    if (!assignment) throw new Error("Expected Role-Permission assignment.");
    await expect(
      database.activityLog.count({
        where: {
          action: "RolePermissionAssigned",
          recordId: assignment.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it("combines permissions from multiple active Roles and ignores inactive Permission", async () => {
    await assignments.assign({
      organizationId: organizationAId,
      userId: userAId,
      roleId: secondRoleAId,
      createdById: actorAId,
    });
    await expect(
      authorization.getEffectivePermissions(userAId, organizationAId),
    ).resolves.toEqual(new Set(["system.health.manage", "system.health.read"]));
    await expect(
      authorization.hasPermission(
        userAId,
        organizationAId,
        "system.disabled.read",
      ),
    ).resolves.toBe(false);
  });

  it("ignores permissions inherited through an inactive Role", async () => {
    const inactiveRole = await roles.create({
      organizationId: organizationAId,
      roleCode: "INACTIVE",
      roleName: "Inactive Role",
      status: "Inactive",
      createdById: actorAId,
    });
    await rolePermissions.assign({
      organizationId: organizationAId,
      roleId: inactiveRole.id,
      permissionId: readPermissionId,
      assignedById: actorAId,
    });
    await assignments.assign({
      organizationId: organizationAId,
      userId: expiredUserId,
      roleId: inactiveRole.id,
      createdById: actorAId,
    });

    await expect(
      authorization.hasPermission(
        expiredUserId,
        organizationAId,
        "system.health.read",
      ),
    ).resolves.toBe(false);
  });

  it("preserves Role-Permission history when access is deactivated", async () => {
    const assignment = await database.rolePermission.findUniqueOrThrow({
      where: {
        roleId_permissionId: {
          roleId: secondRoleAId,
          permissionId: writePermissionId,
        },
      },
    });
    await expect(
      rolePermissions.deactivate(
        secondRoleAId,
        writePermissionId,
        organizationAId,
        actorAId,
      ),
    ).resolves.toBe(true);
    await expect(
      authorization.hasPermission(
        userAId,
        organizationAId,
        "system.health.manage",
      ),
    ).resolves.toBe(false);
    await expect(
      database.rolePermission.findUniqueOrThrow({
        where: {
          roleId_permissionId: {
            roleId: secondRoleAId,
            permissionId: writePermissionId,
          },
        },
      }),
    ).resolves.toMatchObject({ status: "Inactive" });
    await expect(
      database.activityLog.count({
        where: {
          action: "RolePermissionDeactivated",
          recordId: assignment.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it("denies Expired, Inactive, and Revoked Role Assignments", async () => {
    await database.roleAssignment.createMany({
      data: [
        {
          organizationId: organizationAId,
          userId: expiredUserId,
          roleId: roleAId,
          status: "Expired",
          createdById: actorAId,
        },
        {
          organizationId: organizationAId,
          userId: inactiveUserId,
          roleId: roleAId,
          status: "Inactive",
          createdById: actorAId,
        },
      ],
    });
    const revoked = await assignments.assign({
      organizationId: organizationAId,
      userId: historyUserId,
      roleId: roleAId,
      createdById: actorAId,
    });
    if (!revoked) throw new Error("Expected active role assignment.");
    await assignments.revoke(revoked.id, organizationAId, actorAId);
    await expect(
      database.activityLog.count({
        where: { action: "RoleRevoked", recordId: revoked.id },
      }),
    ).resolves.toBe(1);

    for (const userId of [expiredUserId, inactiveUserId, historyUserId]) {
      await expect(
        authorization.hasPermission(
          userId,
          organizationAId,
          "system.health.read",
        ),
      ).resolves.toBe(false);
    }
  });

  it("keeps a non-expired assignment effective and excludes an elapsed assignment", async () => {
    const assignedAt = new Date(Date.now() - 120_000);
    const expiresAt = new Date(Date.now() - 60_000);
    const expiredAssignment = await assignments.assign({
      organizationId: organizationAId,
      userId: timedExpiredUserId,
      roleId: roleAId,
      assignedAt,
      expiresAt,
      createdById: actorAId,
    });

    expect(expiredAssignment).toMatchObject({
      assignedAt,
      expiresAt,
      status: "Active",
    });
    await expect(
      authorization.hasPermission(
        userAId,
        organizationAId,
        "system.health.read",
      ),
    ).resolves.toBe(true);
    await expect(
      authorization.hasPermission(
        timedExpiredUserId,
        organizationAId,
        "system.health.read",
      ),
    ).resolves.toBe(false);
    await expect(
      assignments.findActiveAssignments(timedExpiredUserId, organizationAId),
    ).resolves.toEqual([]);
  });

  it("creates a new effective assignment when the previous assignment has expired", async () => {
    const elapsedAssignment = await database.roleAssignment.findFirstOrThrow({
      where: {
        organizationId: organizationAId,
        userId: timedExpiredUserId,
        roleId: roleAId,
        status: "Active",
      },
    });

    const reassigned = await assignments.assign({
      organizationId: organizationAId,
      userId: timedExpiredUserId,
      roleId: roleAId,
      createdById: actorAId,
    });
    if (!reassigned) throw new Error("Expected role reassignment after expiry.");

    expect(reassigned.id).not.toBe(elapsedAssignment.id);
    expect(reassigned).toMatchObject({ status: "Active", expiresAt: null });
    await expect(
      database.roleAssignment.findUniqueOrThrow({
        where: { id: elapsedAssignment.id },
      }),
    ).resolves.toMatchObject({
      status: "Expired",
      updatedById: actorAId,
    });
    await expect(
      assignments.findActiveAssignments(timedExpiredUserId, organizationAId),
    ).resolves.toEqual([expect.objectContaining({ id: reassigned.id })]);
    await expect(
      authorization.hasPermission(
        timedExpiredUserId,
        organizationAId,
        "system.health.read",
      ),
    ).resolves.toBe(true);

    const duplicate = await assignments.assign({
      organizationId: organizationAId,
      userId: timedExpiredUserId,
      roleId: roleAId,
      createdById: actorAId,
    });
    expect(duplicate?.id).toBe(reassigned.id);
    const history = await assignments.listUserRoles(
      timedExpiredUserId,
      organizationAId,
    );
    expect(history).toHaveLength(2);
    expect(history.map(({ status }) => status).sort()).toEqual([
      "Active",
      "Expired",
    ]);
  });

  it("preserves assignment history and permits only one active duplicate", async () => {
    const reassigned = await assignments.assign({
      organizationId: organizationAId,
      userId: historyUserId,
      roleId: roleAId,
      createdById: actorAId,
    });
    if (!reassigned) throw new Error("Expected reassigned role.");
    const duplicate = await assignments.assign({
      organizationId: organizationAId,
      userId: historyUserId,
      roleId: roleAId,
      createdById: actorAId,
    });
    expect(duplicate?.id).toBe(reassigned.id);
    const history = await assignments.listUserRoles(
      historyUserId,
      organizationAId,
    );
    expect(history).toHaveLength(2);
    expect(history.map(({ status }) => status).sort()).toEqual([
      "Active",
      "Revoked",
    ]);
    await expect(
      database.activityLog.count({
        where: { action: "RoleAssigned", recordId: reassigned.id },
      }),
    ).resolves.toBe(1);
  });

  it("records the approved RBAC security mutations", async () => {
    await expect(
      permissions.updateStatus(
        writePermissionId,
        "Inactive",
        organizationAId,
        actorAId,
      ),
    ).resolves.toBe(true);

    const actions = (
      await database.activityLog.findMany({
        where: { organizationId: organizationAId },
        select: { action: true },
      })
    ).map(({ action }) => action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "RoleAssigned",
        "RoleRevoked",
        "RolePermissionAssigned",
        "RolePermissionDeactivated",
        "PermissionStatusChanged",
      ]),
    );
    await expect(
      database.activityLog.count({
        where: {
          action: "PermissionStatusChanged",
          recordId: writePermissionId,
        },
      }),
    ).resolves.toBe(1);
  });

  it("rolls back an RBAC mutation and its partial audit write when auditing fails", async () => {
    const department = await database.user.findUniqueOrThrow({
      where: { id: actorAId },
      select: { departmentId: true },
    });
    const targetUser = await database.user.create({
      data: {
        organizationId: organizationAId,
        departmentId: department.departmentId,
        firstName: "atomic-rbac",
        email: `${randomUUID()}@rbac.test`,
        username: `atomic-${randomUUID()}`,
        passwordHash: "$2b$12$test-only-not-a-real-credential-hash",
        status: "Active",
      },
    });
    const auditCountBefore = await database.activityLog.count({
      where: {
        userId: actorAId,
        organizationId: organizationAId,
        action: "RoleAssigned",
      },
    });
    const realAudit = new AuditService(new ActivityLogRepository(database));
    const failingAudit = new AuditService(new ActivityLogRepository(database));
    jest
      .spyOn(failingAudit, "recordActivity")
      .mockImplementationOnce(async (input, transaction) => {
        await realAudit.recordActivity(input, transaction);
        throw new Error("Forced audit failure.");
      });
    const atomicAssignments = new UserRoleAssignmentRepository(
      database,
      failingAudit,
    );

    await expect(
      atomicAssignments.assign({
        organizationId: organizationAId,
        userId: targetUser.id,
        roleId: roleAId,
        createdById: actorAId,
      }),
    ).rejects.toThrow("Forced audit failure.");
    await expect(
      database.roleAssignment.count({
        where: {
          organizationId: organizationAId,
          userId: targetUser.id,
          roleId: roleAId,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      database.activityLog.count({
        where: {
          userId: actorAId,
          organizationId: organizationAId,
          action: "RoleAssigned",
        },
      }),
    ).resolves.toBe(auditCountBefore);

    const committed = await atomicAssignments.assign({
      organizationId: organizationAId,
      userId: targetUser.id,
      roleId: roleAId,
      createdById: actorAId,
    });
    expect(committed).not.toBeNull();
    if (!committed) throw new Error("Expected committed role assignment.");
    await expect(
      database.activityLog.count({
        where: { action: "RoleAssigned", recordId: committed.id },
      }),
    ).resolves.toBe(1);
  });

  it("protects assigned Roles from physical deletion", async () => {
    expect(await roles.hasAssignments(roleAId, organizationAId)).toBe(true);
    await expectDatabaseError(
      () => database.role.delete({ where: { id: roleAId } }),
      "P2003",
    );
  });
});
