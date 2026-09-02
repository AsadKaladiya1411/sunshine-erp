import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
import { PrismaClient } from "../../generated/prisma/client.js";
import {
  ApprovalAuthorizationError,
  ApprovalDelegationAmbiguousError,
  ApprovalStateConflictError,
  ApprovalValidationError,
} from "./approval.errors.js";
import {
  ApprovalRepository,
  type ApprovalMutationAudit,
  type PersistApprovalActionInput,
  type PersistApprovalActionResult,
} from "./repositories/approval.repository.js";
import { ApprovalService } from "./services/approval.service.js";
import type {
  ApprovalAuthorizationBoundary,
  ApprovalMode,
  CreateApprovalConfigurationInput,
} from "./types/approval.types.js";

const migrationPaths = [
  "../../../../../prisma/migrations/20260825150000_common_administration_foundation/migration.sql",
  "../../../../../prisma/migrations/20260825220000_authentication_foundation/migration.sql",
  "../../../../../prisma/migrations/20260827052012_rbac_authorization/migration.sql",
  "../../../../../prisma/migrations/20260827090000_rbac_source_compliance/migration.sql",
  "../../../../../prisma/migrations/20260827120000_activity_logs/migration.sql",
  "../../../../../prisma/migrations/20260828045909_transactional_outbox_foundation/migration.sql",
  "../../../../../prisma/migrations/20260829121500_approval_engine_foundation/migration.sql",
  "../../../../../prisma/migrations/20260902103000_approval_tenant_integrity/migration.sql",
  "../../../../../prisma/migrations/20260902120000_approval_decision_concurrency/migration.sql",
].map((migrationPath) =>
  fileURLToPath(new URL(migrationPath, import.meta.url)),
);

const schemaName = `approval_test_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests.");
}

class TestApprovalAuthorization implements ApprovalAuthorizationBoundary {
  readonly authorizedUsers = new Set<string>();
  readonly roleMemberships = new Set<string>();
  canPerformCalls = 0;

  async canPerformApproval(userId: string): Promise<boolean> {
    this.canPerformCalls += 1;
    return this.authorizedUsers.has(userId);
  }

  async hasActiveRole(
    userId: string,
    organizationId: string,
    roleId: string,
  ): Promise<boolean> {
    return this.roleMemberships.has(`${organizationId}:${userId}:${roleId}`);
  }
}

class SynchronizedApprovalRepository extends ApprovalRepository {
  private persistArrivals = 0;
  private releasePersistBarrier!: () => void;
  private readonly persistBarrier = new Promise<void>((resolve) => {
    this.releasePersistBarrier = resolve;
  });

  get synchronizedPersistCalls(): number {
    return this.persistArrivals;
  }

  override async persistAction(
    input: PersistApprovalActionInput,
    audit?: ApprovalMutationAudit<PersistApprovalActionResult>,
  ): Promise<PersistApprovalActionResult | null> {
    this.persistArrivals += 1;
    if (this.persistArrivals === 2) {
      this.releasePersistBarrier();
    }
    await this.persistBarrier;
    return super.persistAction(input, audit);
  }
}

function uniqueCode(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function expectDatabaseError(
  operation: () => Promise<unknown>,
  code?: string,
): Promise<void> {
  try {
    await operation();
    throw new Error("Expected database operation to fail.");
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "Expected database operation to fail."
    ) {
      throw error;
    }
    if (code) {
      expect(error).toMatchObject({ code });
    }
  }
}

jest.setTimeout(120_000);

describe("Approval Engine foundation", () => {
  let adminClient: Client;
  let sqlClient: Client;
  let database: PrismaClient;
  let repository: ApprovalRepository;
  let authorization: TestApprovalAuthorization;
  let audit: AuditService;
  let service: ApprovalService;

  let organizationAId: string;
  let organizationBId: string;
  let departmentAId: string;
  let departmentBId: string;
  let creatorAId: string;
  let approverAId: string;
  let secondApproverAId: string;
  let delegateAId: string;
  let userBId: string;
  let secondUserBId: string;
  let roleAId: string;
  let roleBId: string;

  async function createConfiguration(
    mode: ApprovalMode = "Single",
    overrides: Partial<CreateApprovalConfigurationInput> = {},
  ) {
    return service.createConfiguration({
      organizationId: organizationAId,
      configurationCode: uniqueCode("APR"),
      configurationName: "Foundation approval",
      moduleName: "Foundation",
      entityName: "FoundationRecord",
      approvalRequired: true,
      approvalMode: mode,
      submissionStatus: "Configured",
      status: "Active",
      createdById: creatorAId,
      ...overrides,
    });
  }

  async function createUserLevel(
    configurationId: string,
    levelNumber: number,
    approverUserId: string,
    isRequired = true,
  ) {
    return service.createLevel({
      organizationId: organizationAId,
      approvalConfigurationId: configurationId,
      levelNumber,
      levelName: `Level ${levelNumber}`,
      approverType: "User",
      approverUserId,
      isRequired,
      status: "Active",
      createdById: creatorAId,
    });
  }

  async function submit(configurationId: string, requestedById = creatorAId) {
    return service.submitRequest({
      organizationId: organizationAId,
      approvalConfigurationId: configurationId,
      approvalNumber: uniqueCode("REQ"),
      targetModule: "Foundation",
      targetEntity: "FoundationRecord",
      targetRecordId: randomUUID(),
      requestedById,
      createdById: requestedById,
    });
  }

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
    repository = new ApprovalRepository(database);
    authorization = new TestApprovalAuthorization();
    audit = new AuditService(new ActivityLogRepository(database));
    service = new ApprovalService(authorization, repository, audit);

    const organizationA = await database.organization.create({
      data: {
        id: randomUUID(),
        organizationCode: uniqueCode("ORG-A"),
        organizationName: uniqueCode("Organization A"),
        status: "Active",
      },
    });
    const organizationB = await database.organization.create({
      data: {
        id: randomUUID(),
        organizationCode: uniqueCode("ORG-B"),
        organizationName: uniqueCode("Organization B"),
        status: "Active",
      },
    });
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;
    departmentAId = (
      await database.department.create({
        data: {
          organizationId: organizationAId,
          departmentCode: uniqueCode("DEPT-A"),
          departmentName: uniqueCode("Department A"),
          status: "Active",
        },
      })
    ).id;
    departmentBId = (
      await database.department.create({
        data: {
          organizationId: organizationBId,
          departmentCode: uniqueCode("DEPT-B"),
          departmentName: uniqueCode("Department B"),
          status: "Active",
        },
      })
    ).id;

    async function createUser(
      organizationId: string,
      departmentId: string,
      label: string,
    ): Promise<string> {
      return (
        await database.user.create({
          data: {
            organizationId,
            departmentId,
            firstName: label,
            email: `${uniqueCode(label)}@example.test`,
            username: uniqueCode(label),
            passwordHash: "test-password-hash",
            status: "Active",
          },
        })
      ).id;
    }

    creatorAId = await createUser(organizationAId, departmentAId, "creator");
    approverAId = await createUser(organizationAId, departmentAId, "approver");
    secondApproverAId = await createUser(
      organizationAId,
      departmentAId,
      "second",
    );
    delegateAId = await createUser(organizationAId, departmentAId, "delegate");
    userBId = await createUser(organizationBId, departmentBId, "tenant-b");
    secondUserBId = await createUser(
      organizationBId,
      departmentBId,
      "tenant-b-second",
    );

    roleAId = (
      await database.role.create({
        data: {
          organizationId: organizationAId,
          roleCode: uniqueCode("ROLE-A"),
          roleName: uniqueCode("Role A"),
          status: "Active",
        },
      })
    ).id;
    roleBId = (
      await database.role.create({
        data: {
          organizationId: organizationBId,
          roleCode: uniqueCode("ROLE-B"),
          roleName: uniqueCode("Role B"),
          status: "Active",
        },
      })
    ).id;

    for (const userId of [
      creatorAId,
      approverAId,
      secondApproverAId,
      delegateAId,
      userBId,
      secondUserBId,
    ]) {
      authorization.authorizedUsers.add(userId);
    }
    authorization.roleMemberships.add(
      `${organizationAId}:${approverAId}:${roleAId}`,
    );
  });

  beforeEach(async () => {
    await database.activityLog.deleteMany({
      where: { module: "Approval Workflow" },
    });
    await database.approvalHistory.deleteMany();
    await database.approvalAction.deleteMany();
    await database.approvalRequest.deleteMany();
    await database.approvalDelegation.deleteMany();
    await database.approvalLevel.deleteMany();
    await database.approvalConfiguration.deleteMany();
    authorization.canPerformCalls = 0;
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

  it("creates exactly the six approved tables, checks, indexes, and restrictive foreign keys", async () => {
    const tables = await sqlClient.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name LIKE 'approval_%'
       ORDER BY table_name`,
      [schemaName],
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "approval_actions",
      "approval_configurations",
      "approval_delegations",
      "approval_histories",
      "approval_levels",
      "approval_requests",
    ]);

    const requestColumns = await sqlClient.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'approval_requests'
       ORDER BY ordinal_position`,
      [schemaName],
    );
    const columnNames = requestColumns.rows.map(
      ({ column_name }) => column_name,
    );
    expect(columnNames).toContain("approval_status");
    expect(columnNames).not.toEqual(
      expect.arrayContaining(["decision", "decision_remarks", "decided_at"]),
    );

    const checks = await sqlClient.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = $1 AND constraint_type = 'CHECK'
         AND table_name LIKE 'approval_%'
       ORDER BY constraint_name`,
      [schemaName],
    );
    expect(checks.rows.map(({ constraint_name }) => constraint_name)).toEqual(
      expect.arrayContaining([
        "approval_levels_level_number_check",
        "approval_levels_approver_source_check",
        "approval_requests_completion_time_check",
        "approval_actions_action_type_check",
        "approval_actions_rejection_reason_check",
        "approval_actions_return_reason_check",
        "approval_actions_delegated_user_check",
        "approval_delegations_different_users_check",
        "approval_delegations_effective_period_check",
      ]),
    );

    const indexCount = await sqlClient.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pg_indexes
       WHERE schemaname = $1 AND tablename LIKE 'approval_%'`,
      [schemaName],
    );
    expect(Number(indexCount.rows[0]?.count)).toBeGreaterThanOrEqual(50);

    const deletionActions = await sqlClient.query<{ delete_action: string }>(
      `SELECT DISTINCT rc.delete_rule AS delete_action
       FROM information_schema.referential_constraints rc
       WHERE rc.constraint_schema = $1
         AND rc.constraint_name LIKE 'approval_%_fkey'`,
      [schemaName],
    );
    expect(deletionActions.rows).toEqual([{ delete_action: "RESTRICT" }]);
  });

  it("enforces every Approval tenant relationship at the database layer", async () => {
    async function createTenantGraph(input: {
      readonly organizationId: string;
      readonly actorId: string;
      readonly approverId: string;
      readonly delegateId: string;
      readonly roleId: string;
      readonly suffix: string;
    }) {
      const configuration = await database.approvalConfiguration.create({
        data: {
          organizationId: input.organizationId,
          configurationCode: uniqueCode(`TENANT-${input.suffix}`),
          configurationName: `Tenant integrity ${input.suffix}`,
          moduleName: "Foundation",
          entityName: "FoundationRecord",
          approvalRequired: true,
          approvalMode: "Multi Level",
          submissionStatus: "Configured",
          status: "Active",
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });
      const userLevel = await database.approvalLevel.create({
        data: {
          organizationId: input.organizationId,
          approvalConfigurationId: configuration.id,
          levelNumber: input.suffix === "A" ? 1 : 101,
          levelName: "User approver",
          approverType: "User",
          approverUserId: input.approverId,
          status: "Active",
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });
      const roleLevel = await database.approvalLevel.create({
        data: {
          organizationId: input.organizationId,
          approvalConfigurationId: configuration.id,
          levelNumber: input.suffix === "A" ? 2 : 102,
          levelName: "Role approver",
          approverType: "Role",
          approverRoleId: input.roleId,
          status: "Active",
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });
      const request = await database.approvalRequest.create({
        data: {
          organizationId: input.organizationId,
          approvalConfigurationId: configuration.id,
          approvalNumber: uniqueCode(`TENANT-REQ-${input.suffix}`),
          targetModule: "Foundation",
          targetEntity: "FoundationRecord",
          targetRecordId: randomUUID(),
          requestedById: input.actorId,
          currentLevelId: userLevel.id,
          approvalStatus: "Pending",
          submittedAt: new Date(),
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });
      const action = await database.approvalAction.create({
        data: {
          organizationId: input.organizationId,
          approvalRequestId: request.id,
          approvalLevelId: userLevel.id,
          approverUserId: input.approverId,
          actionType: "Delegate",
          delegatedToUserId: input.delegateId,
          status: "Completed",
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });
      const history = await database.approvalHistory.create({
        data: {
          organizationId: input.organizationId,
          approvalRequestId: request.id,
          approvalLevelId: userLevel.id,
          approvalActionId: action.id,
          eventType: "Delegated",
          performedById: input.approverId,
          createdById: input.actorId,
        },
      });
      const delegation = await database.approvalDelegation.create({
        data: {
          organizationId: input.organizationId,
          delegatorUserId: input.actorId,
          delegateUserId: input.delegateId,
          approvalConfigurationId: configuration.id,
          approvalLevelId: roleLevel.id,
          effectiveFrom: new Date(),
          status: "Active",
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });
      return {
        configuration,
        userLevel,
        roleLevel,
        request,
        action,
        history,
        delegation,
      };
    }

    const tenantA = await createTenantGraph({
      organizationId: organizationAId,
      actorId: creatorAId,
      approverId: approverAId,
      delegateId: delegateAId,
      roleId: roleAId,
      suffix: "A",
    });
    const tenantB = await createTenantGraph({
      organizationId: organizationBId,
      actorId: userBId,
      approverId: userBId,
      delegateId: secondUserBId,
      roleId: roleBId,
      suffix: "B",
    });

    expect([
      tenantA.configuration.organizationId,
      tenantA.userLevel.organizationId,
      tenantA.roleLevel.organizationId,
      tenantA.request.organizationId,
      tenantA.action.organizationId,
      tenantA.history.organizationId,
      tenantA.delegation.organizationId,
    ]).toEqual(Array(7).fill(organizationAId));
    expect([
      tenantB.configuration.organizationId,
      tenantB.userLevel.organizationId,
      tenantB.roleLevel.organizationId,
      tenantB.request.organizationId,
      tenantB.action.organizationId,
      tenantB.history.organizationId,
      tenantB.delegation.organizationId,
    ]).toEqual(Array(7).fill(organizationBId));

    const crossTenantAttempts: readonly {
      readonly relationship: string;
      readonly operation: () => Promise<unknown>;
    }[] = [
      {
        relationship: "configuration.createdBy",
        operation: () =>
          database.approvalConfiguration.update({
            where: { id: tenantA.configuration.id },
            data: { createdById: userBId },
          }),
      },
      {
        relationship: "configuration.updatedBy",
        operation: () =>
          database.approvalConfiguration.update({
            where: { id: tenantA.configuration.id },
            data: { updatedById: userBId },
          }),
      },
      {
        relationship: "level.configuration",
        operation: () =>
          database.approvalLevel.update({
            where: { id: tenantA.userLevel.id },
            data: { approvalConfigurationId: tenantB.configuration.id },
          }),
      },
      {
        relationship: "level.approverUser",
        operation: () =>
          database.approvalLevel.update({
            where: { id: tenantA.userLevel.id },
            data: { approverUserId: userBId },
          }),
      },
      {
        relationship: "level.approverRole",
        operation: () =>
          database.approvalLevel.update({
            where: { id: tenantA.roleLevel.id },
            data: { approverRoleId: roleBId },
          }),
      },
      {
        relationship: "level.createdBy",
        operation: () =>
          database.approvalLevel.update({
            where: { id: tenantA.userLevel.id },
            data: { createdById: userBId },
          }),
      },
      {
        relationship: "level.updatedBy",
        operation: () =>
          database.approvalLevel.update({
            where: { id: tenantA.userLevel.id },
            data: { updatedById: userBId },
          }),
      },
      {
        relationship: "request.configuration",
        operation: () =>
          database.approvalRequest.update({
            where: { id: tenantA.request.id },
            data: { approvalConfigurationId: tenantB.configuration.id },
          }),
      },
      {
        relationship: "request.requestedBy",
        operation: () =>
          database.approvalRequest.update({
            where: { id: tenantA.request.id },
            data: { requestedById: userBId },
          }),
      },
      {
        relationship: "request.currentLevel",
        operation: () =>
          database.approvalRequest.update({
            where: { id: tenantA.request.id },
            data: { currentLevelId: tenantB.userLevel.id },
          }),
      },
      {
        relationship: "request.createdBy",
        operation: () =>
          database.approvalRequest.update({
            where: { id: tenantA.request.id },
            data: { createdById: userBId },
          }),
      },
      {
        relationship: "request.updatedBy",
        operation: () =>
          database.approvalRequest.update({
            where: { id: tenantA.request.id },
            data: { updatedById: userBId },
          }),
      },
      {
        relationship: "action.request",
        operation: () =>
          database.approvalAction.update({
            where: { id: tenantA.action.id },
            data: { approvalRequestId: tenantB.request.id },
          }),
      },
      {
        relationship: "action.level",
        operation: () =>
          database.approvalAction.update({
            where: { id: tenantA.action.id },
            data: { approvalLevelId: tenantB.userLevel.id },
          }),
      },
      {
        relationship: "action.approverUser",
        operation: () =>
          database.approvalAction.update({
            where: { id: tenantA.action.id },
            data: { approverUserId: userBId },
          }),
      },
      {
        relationship: "action.delegatedToUser",
        operation: () =>
          database.approvalAction.update({
            where: { id: tenantA.action.id },
            data: { delegatedToUserId: userBId },
          }),
      },
      {
        relationship: "action.createdBy",
        operation: () =>
          database.approvalAction.update({
            where: { id: tenantA.action.id },
            data: { createdById: userBId },
          }),
      },
      {
        relationship: "action.updatedBy",
        operation: () =>
          database.approvalAction.update({
            where: { id: tenantA.action.id },
            data: { updatedById: userBId },
          }),
      },
      {
        relationship: "history.request",
        operation: () =>
          database.approvalHistory.update({
            where: { id: tenantA.history.id },
            data: { approvalRequestId: tenantB.request.id },
          }),
      },
      {
        relationship: "history.level",
        operation: () =>
          database.approvalHistory.update({
            where: { id: tenantA.history.id },
            data: { approvalLevelId: tenantB.userLevel.id },
          }),
      },
      {
        relationship: "history.action",
        operation: () =>
          database.approvalHistory.update({
            where: { id: tenantA.history.id },
            data: { approvalActionId: tenantB.action.id },
          }),
      },
      {
        relationship: "history.performedBy",
        operation: () =>
          database.approvalHistory.update({
            where: { id: tenantA.history.id },
            data: { performedById: userBId },
          }),
      },
      {
        relationship: "history.createdBy",
        operation: () =>
          database.approvalHistory.update({
            where: { id: tenantA.history.id },
            data: { createdById: userBId },
          }),
      },
      {
        relationship: "delegation.delegatorUser",
        operation: () =>
          database.approvalDelegation.update({
            where: { id: tenantA.delegation.id },
            data: { delegatorUserId: userBId },
          }),
      },
      {
        relationship: "delegation.delegateUser",
        operation: () =>
          database.approvalDelegation.update({
            where: { id: tenantA.delegation.id },
            data: { delegateUserId: userBId },
          }),
      },
      {
        relationship: "delegation.configuration",
        operation: () =>
          database.approvalDelegation.update({
            where: { id: tenantA.delegation.id },
            data: { approvalConfigurationId: tenantB.configuration.id },
          }),
      },
      {
        relationship: "delegation.level",
        operation: () =>
          database.approvalDelegation.update({
            where: { id: tenantA.delegation.id },
            data: { approvalLevelId: tenantB.roleLevel.id },
          }),
      },
      {
        relationship: "delegation.createdBy",
        operation: () =>
          database.approvalDelegation.update({
            where: { id: tenantA.delegation.id },
            data: { createdById: userBId },
          }),
      },
      {
        relationship: "delegation.updatedBy",
        operation: () =>
          database.approvalDelegation.update({
            where: { id: tenantA.delegation.id },
            data: { updatedById: userBId },
          }),
      },
    ];

    expect(crossTenantAttempts).toHaveLength(29);
    for (const attempt of crossTenantAttempts) {
      await expectDatabaseError(attempt.operation, "P2003");
    }

    await expect(
      database.approvalConfiguration.findUniqueOrThrow({
        where: { id: tenantA.configuration.id },
        select: { organizationId: true },
      }),
    ).resolves.toEqual({ organizationId: organizationAId });
  });

  it("validates configurations, preserves organization ownership, and enforces code uniqueness", async () => {
    const configuration = await createConfiguration("Single");
    expect(configuration).toMatchObject({
      organizationId: organizationAId,
      approvalMode: "Single",
      approvalRequired: true,
      submissionStatus: "Configured",
      status: "Active",
    });
    await expect(
      service.isApprovalRequired(configuration.id, organizationAId),
    ).resolves.toBe(true);
    await expect(
      service.isApprovalRequired(configuration.id, organizationBId),
    ).rejects.toThrow();

    await expect(
      service.createConfiguration({
        organizationId: organizationAId,
        configurationCode: configuration.configurationCode,
        configurationName: "Duplicate",
        moduleName: "Foundation",
        entityName: "FoundationRecord",
        approvalMode: "Single",
        submissionStatus: "Configured",
        status: "Active",
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      service.createConfiguration({
        organizationId: organizationAId,
        configurationCode: " ",
        configurationName: "Invalid",
        moduleName: "Foundation",
        entityName: "FoundationRecord",
        approvalMode: "Single",
        submissionStatus: "Configured",
        status: "Active",
      }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);

    const noApproval = await createConfiguration("Single", {
      approvalRequired: false,
    });
    await expect(
      service.isApprovalRequired(noApproval.id, organizationAId),
    ).resolves.toBe(false);
    await expect(submit(noApproval.id)).rejects.toBeInstanceOf(
      ApprovalStateConflictError,
    );
  });

  it("enforces level sequence, User/Role XOR, tenant ownership, and deterministic ordering", async () => {
    const configuration = await createConfiguration("Multi Level");
    const second = await createUserLevel(
      configuration.id,
      2,
      secondApproverAId,
    );
    const first = await createUserLevel(configuration.id, 1, approverAId);
    await expect(
      repository.listLevels(configuration.id, organizationAId),
    ).resolves.toEqual([
      expect.objectContaining({ id: first.id, levelNumber: 1 }),
      expect.objectContaining({ id: second.id, levelNumber: 2 }),
    ]);

    await expect(
      createUserLevel(configuration.id, 1, approverAId),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      service.createLevel({
        organizationId: organizationAId,
        approvalConfigurationId: configuration.id,
        levelNumber: 0,
        levelName: "Invalid",
        approverType: "User",
        approverUserId: approverAId,
        status: "Active",
      }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);
    await expect(
      service.createLevel({
        organizationId: organizationAId,
        approvalConfigurationId: configuration.id,
        levelNumber: 3,
        levelName: "Conflicting",
        approverType: "User",
        approverUserId: approverAId,
        approverRoleId: roleAId,
        status: "Active",
      }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);
    await expect(
      service.createLevel({
        organizationId: organizationAId,
        approvalConfigurationId: configuration.id,
        levelNumber: 3,
        levelName: "Cross tenant Role",
        approverType: "Role",
        approverRoleId: roleBId,
        status: "Active",
      }),
    ).rejects.toThrow();
  });

  it("supports single-level approval and prevents creator self-approval", async () => {
    const selfConfiguration = await createConfiguration("Single");
    await createUserLevel(selfConfiguration.id, 1, creatorAId);
    const selfRequest = await submit(selfConfiguration.id);
    await expect(
      service.recordAction({
        organizationId: organizationAId,
        approvalRequestId: selfRequest.id,
        approverUserId: creatorAId,
        actionType: "Approve",
      }),
    ).rejects.toBeInstanceOf(ApprovalAuthorizationError);

    const configuration = await createConfiguration("Single");
    await createUserLevel(configuration.id, 1, approverAId);
    const request = await submit(configuration.id);
    const result = await service.recordAction({
      organizationId: organizationAId,
      approvalRequestId: request.id,
      approverUserId: approverAId,
      actionType: "Approve",
      comments: "Approved.",
    });
    expect(result.request).toMatchObject({
      approvalStatus: "Approved",
      currentLevelId: null,
    });
    expect(result.request.completedAt).toBeInstanceOf(Date);
    await expect(
      service.listHistory(request.id, organizationAId),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "Submitted" }),
        expect.objectContaining({ eventType: "Approved" }),
        expect.objectContaining({ eventType: "Completed" }),
      ]),
    );
    expect(authorization.canPerformCalls).toBeGreaterThan(0);
  });

  it("advances multi-level requests sequentially and blocks premature completion", async () => {
    const configuration = await createConfiguration("Multi Level");
    const levelOne = await createUserLevel(configuration.id, 1, approverAId);
    const levelTwo = await createUserLevel(
      configuration.id,
      2,
      secondApproverAId,
    );
    const request = await submit(configuration.id);

    await expect(
      service.recordAction({
        organizationId: organizationAId,
        approvalRequestId: request.id,
        approverUserId: secondApproverAId,
        actionType: "Approve",
      }),
    ).rejects.toBeInstanceOf(ApprovalAuthorizationError);

    const firstResult = await service.recordAction({
      organizationId: organizationAId,
      approvalRequestId: request.id,
      approverUserId: approverAId,
      actionType: "Approve",
    });
    expect(firstResult.request).toMatchObject({
      approvalStatus: "Pending",
      currentLevelId: levelTwo.id,
      completedAt: null,
    });
    expect(firstResult.action.approvalLevelId).toBe(levelOne.id);

    const finalResult = await service.recordAction({
      organizationId: organizationAId,
      approvalRequestId: request.id,
      approverUserId: secondApproverAId,
      actionType: "Approve",
    });
    expect(finalResult.request).toMatchObject({
      approvalStatus: "Approved",
      currentLevelId: null,
    });
    await expect(
      service.listActions(request.id, organizationAId),
    ).resolves.toHaveLength(2);
  });

  it("records Reject, Return, and Delegate with required reasons and immutable history", async () => {
    const configuration = await createConfiguration("Single");
    await createUserLevel(configuration.id, 1, approverAId);

    const rejected = await submit(configuration.id);
    await expect(
      service.recordAction({
        organizationId: organizationAId,
        approvalRequestId: rejected.id,
        approverUserId: approverAId,
        actionType: "Reject",
      }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);
    await service.recordAction({
      organizationId: organizationAId,
      approvalRequestId: rejected.id,
      approverUserId: approverAId,
      actionType: "Reject",
      rejectionReason: "Insufficient evidence.",
    });
    await expect(
      service.listHistory(rejected.id, organizationAId),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "Rejected",
          reason: "Insufficient evidence.",
        }),
      ]),
    );

    const returned = await submit(configuration.id);
    await expect(
      service.recordAction({
        organizationId: organizationAId,
        approvalRequestId: returned.id,
        approverUserId: approverAId,
        actionType: "Return",
      }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);
    await service.recordAction({
      organizationId: organizationAId,
      approvalRequestId: returned.id,
      approverUserId: approverAId,
      actionType: "Return",
      returnReason: "Revision required.",
    });

    const delegated = await submit(configuration.id);
    const delegatedResult = await service.recordAction({
      organizationId: organizationAId,
      approvalRequestId: delegated.id,
      approverUserId: approverAId,
      actionType: "Delegate",
      delegatedToUserId: delegateAId,
    });
    expect(delegatedResult.request.approvalStatus).toBe("Pending");
    expect(delegatedResult.action.delegatedToUserId).toBe(delegateAId);
    expect("update" in repository).toBe(false);
    expect("delete" in repository).toBe(false);
  });

  it("allows only one concurrent Delegate decision for the same request and level", async () => {
    const configuration = await createConfiguration("Single");
    const level = await createUserLevel(configuration.id, 1, approverAId);
    const request = await submit(configuration.id);
    const synchronizedRepository = new SynchronizedApprovalRepository(database);
    const synchronizedService = new ApprovalService(
      authorization,
      synchronizedRepository,
      audit,
    );

    const results = await Promise.allSettled([
      synchronizedService.recordAction({
        organizationId: organizationAId,
        approvalRequestId: request.id,
        approverUserId: approverAId,
        actionType: "Delegate",
        delegatedToUserId: delegateAId,
      }),
      synchronizedService.recordAction({
        organizationId: organizationAId,
        approvalRequestId: request.id,
        approverUserId: approverAId,
        actionType: "Delegate",
        delegatedToUserId: secondApproverAId,
      }),
    ]);

    expect(synchronizedRepository.synchronizedPersistCalls).toBe(2);
    const successfulResults = results.filter(
      (result) => result.status === "fulfilled",
    );
    const failedResults = results.filter((result) => result.status === "rejected");
    expect(successfulResults).toHaveLength(1);
    expect(failedResults).toHaveLength(1);
    const successfulResult = successfulResults[0];
    const failedResult = failedResults[0];
    if (
      !successfulResult ||
      successfulResult.status !== "fulfilled" ||
      !failedResult ||
      failedResult.status !== "rejected"
    ) {
      throw new Error("Expected one successful and one rejected Delegate result.");
    }
    expect(failedResult.reason).toBeInstanceOf(ApprovalStateConflictError);
    expect(successfulResult.value.request).toMatchObject({
      id: request.id,
      approvalStatus: "Pending",
      currentLevelId: level.id,
      decisionVersion: 1,
    });

    const persistedRequest = await database.approvalRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: {
        approvalStatus: true,
        currentLevelId: true,
        decisionVersion: true,
      },
    });
    expect(persistedRequest).toEqual({
      approvalStatus: "Pending",
      currentLevelId: level.id,
      decisionVersion: 1,
    });

    const actions = await database.approvalAction.findMany({
      where: {
        organizationId: organizationAId,
        approvalRequestId: request.id,
        approvalLevelId: level.id,
        actionType: "Delegate",
        status: "Completed",
      },
    });
    expect(actions).toHaveLength(1);
    expect([delegateAId, secondApproverAId]).toContain(
      actions[0]?.delegatedToUserId,
    );

    const delegatedHistories = await database.approvalHistory.findMany({
      where: {
        organizationId: organizationAId,
        approvalRequestId: request.id,
        approvalLevelId: level.id,
        eventType: "Delegated",
      },
    });
    expect(delegatedHistories).toHaveLength(1);
    expect(delegatedHistories[0]?.approvalActionId).toBe(actions[0]?.id);
    await expect(
      database.approvalDelegation.count({
        where: { organizationId: organizationAId },
      }),
    ).resolves.toBe(0);
    await expect(
      database.activityLog.count({
        where: {
          organizationId: organizationAId,
          module: "Approval Workflow",
          entityName: "ApprovalAction",
          recordId: actions[0]?.id,
          action: "ApprovalActionRecorded",
        },
      }),
    ).resolves.toBe(1);
  });

  it("validates delegation periods, scopes delegated approval, and preserves identities", async () => {
    const configuration = await createConfiguration("Single");
    const level = await createUserLevel(configuration.id, 1, approverAId);
    await expect(
      service.createDelegation({
        organizationId: organizationAId,
        delegatorUserId: approverAId,
        delegateUserId: approverAId,
        effectiveFrom: new Date(),
        status: "Active",
      }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);
    await expect(
      service.createDelegation({
        organizationId: organizationAId,
        delegatorUserId: approverAId,
        delegateUserId: delegateAId,
        effectiveFrom: new Date("2030-01-02T00:00:00.000Z"),
        effectiveTo: new Date("2030-01-01T00:00:00.000Z"),
        status: "Active",
      }),
    ).rejects.toBeInstanceOf(ApprovalValidationError);

    const effectiveFrom = new Date(Date.now() - 60_000);
    const delegation = await service.createDelegation({
      organizationId: organizationAId,
      delegatorUserId: approverAId,
      delegateUserId: delegateAId,
      approvalConfigurationId: configuration.id,
      approvalLevelId: level.id,
      effectiveFrom,
      status: "Active",
      createdById: approverAId,
    });
    await expect(
      database.activityLog.count({
        where: {
          action: "ApprovalDelegationCreated",
          recordId: delegation.id,
        },
      }),
    ).resolves.toBe(1);
    expect(delegation).toMatchObject({
      delegatorUserId: approverAId,
      delegateUserId: delegateAId,
      approvalConfigurationId: configuration.id,
      approvalLevelId: level.id,
    });

    const request = await submit(configuration.id);
    const result = await service.recordAction({
      organizationId: organizationAId,
      approvalRequestId: request.id,
      approverUserId: delegateAId,
      delegatedFromUserId: approverAId,
      actionType: "Approve",
    });
    expect(result.action.approverUserId).toBe(delegateAId);

    const cancelledRequest = await submit(configuration.id);
    await service.createDelegation({
      organizationId: organizationAId,
      delegatorUserId: approverAId,
      delegateUserId: secondApproverAId,
      approvalConfigurationId: configuration.id,
      approvalLevelId: level.id,
      effectiveFrom,
      status: "Cancelled",
    });
    await expect(
      service.recordAction({
        organizationId: organizationAId,
        approvalRequestId: cancelledRequest.id,
        approverUserId: secondApproverAId,
        delegatedFromUserId: approverAId,
        actionType: "Approve",
      }),
    ).rejects.toBeInstanceOf(ApprovalAuthorizationError);
  });

  it("refuses ambiguous delegation instead of inventing a precedence rule", async () => {
    const configuration = await createConfiguration("Single");
    const level = await createUserLevel(configuration.id, 1, approverAId);
    const delegationInput = {
      organizationId: organizationAId,
      delegatorUserId: approverAId,
      delegateUserId: delegateAId,
      approvalConfigurationId: configuration.id,
      approvalLevelId: level.id,
      effectiveFrom: new Date(Date.now() - 60_000),
      status: "Active" as const,
    };
    await service.createDelegation(delegationInput);
    await service.createDelegation(delegationInput);
    const request = await submit(configuration.id);
    await expect(
      service.recordAction({
        organizationId: organizationAId,
        approvalRequestId: request.id,
        approverUserId: delegateAId,
        delegatedFromUserId: approverAId,
        actionType: "Approve",
      }),
    ).rejects.toBeInstanceOf(ApprovalDelegationAmbiguousError);
  });

  it("supports Role approvers through the RBAC boundary without duplicating RBAC", async () => {
    const configuration = await createConfiguration("Single");
    await service.createLevel({
      organizationId: organizationAId,
      approvalConfigurationId: configuration.id,
      levelNumber: 1,
      levelName: "Role approval",
      approverType: "Role",
      approverRoleId: roleAId,
      status: "Active",
      createdById: creatorAId,
    });
    const request = await submit(configuration.id);
    await expect(
      service.recordAction({
        organizationId: organizationAId,
        approvalRequestId: request.id,
        approverUserId: approverAId,
        actionType: "Approve",
      }),
    ).resolves.toMatchObject({
      request: expect.objectContaining({ approvalStatus: "Approved" }),
    });
  });

  it("rolls back Request, Action, and History atomically when a database check fails", async () => {
    const configuration = await createConfiguration("Single");
    const level = await createUserLevel(configuration.id, 1, approverAId);
    const request = await submit(configuration.id);
    const historyBefore = await database.approvalHistory.count({
      where: { approvalRequestId: request.id },
    });

    await expectDatabaseError(() =>
      repository.persistAction({
        organizationId: organizationAId,
        approvalRequestId: request.id,
        expectedCurrentLevelId: level.id,
        expectedDecisionVersion: request.decisionVersion,
        approverUserId: approverAId,
        actionType: "Reject",
        actionDate: new Date(),
        fromStatus: "Pending",
        toStatus: "Rejected",
        nextLevelId: null,
        completedAt: new Date(),
        eventType: "Rejected",
        appendCompletionEvent: false,
      }),
    );
    await expect(
      database.approvalRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).resolves.toMatchObject({
      approvalStatus: "Pending",
      currentLevelId: level.id,
      completedAt: null,
    });
    await expect(
      database.approvalAction.count({
        where: { approvalRequestId: request.id },
      }),
    ).resolves.toBe(0);
    await expect(
      database.approvalHistory.count({
        where: { approvalRequestId: request.id },
      }),
    ).resolves.toBe(historyBefore);
  });

  it("enforces tenant isolation, historical deletion protection, and centralized audit", async () => {
    const configuration = await createConfiguration("Single");
    const level = await createUserLevel(configuration.id, 1, approverAId);
    const request = await submit(configuration.id);
    const result = await service.recordAction({
      organizationId: organizationAId,
      approvalRequestId: request.id,
      approverUserId: approverAId,
      actionType: "Approve",
    });

    await expect(
      repository.findRequest(request.id, organizationBId),
    ).resolves.toBeNull();
    await expect(
      repository.listActions(request.id, organizationBId),
    ).resolves.toEqual([]);
    await expect(
      repository.listHistory(request.id, organizationBId),
    ).resolves.toEqual([]);
    await expect(
      service.createLevel({
        organizationId: organizationAId,
        approvalConfigurationId: configuration.id,
        levelNumber: 2,
        levelName: "Tenant violation",
        approverType: "User",
        approverUserId: userBId,
        status: "Active",
      }),
    ).rejects.toThrow();

    await expectDatabaseError(
      () =>
        database.approvalConfiguration.delete({
          where: { id: configuration.id },
        }),
      "P2003",
    );
    await expectDatabaseError(
      () => database.approvalLevel.delete({ where: { id: level.id } }),
      "P2003",
    );
    await expectDatabaseError(
      () => database.approvalAction.delete({ where: { id: result.action.id } }),
      "P2003",
    );

    const auditActions = (
      await database.activityLog.findMany({
        where: { organizationId: organizationAId, module: "Approval Workflow" },
        select: { action: true },
      })
    ).map(({ action }) => action);
    expect(auditActions).toEqual(
      expect.arrayContaining([
        "ApprovalConfigurationCreated",
        "ApprovalLevelCreated",
        "ApprovalRequestSubmitted",
        "ApprovalActionRecorded",
      ]),
    );
    for (const [action, recordId] of [
      ["ApprovalConfigurationCreated", configuration.id],
      ["ApprovalLevelCreated", level.id],
      ["ApprovalRequestSubmitted", request.id],
      ["ApprovalActionRecorded", result.action.id],
    ] as const) {
      await expect(
        database.activityLog.count({
          where: { organizationId: organizationAId, action, recordId },
        }),
      ).resolves.toBe(1);
    }
  });

  it("rolls back an Approval mutation and its partial audit write when auditing fails", async () => {
    const configurationCode = uniqueCode("ATOMIC");
    const auditCountBefore = await database.activityLog.count({
      where: {
        organizationId: organizationAId,
        action: "ApprovalConfigurationCreated",
      },
    });
    const realAudit = new AuditService(new ActivityLogRepository(database));
    const recordActivity = jest
      .spyOn(audit, "recordActivity")
      .mockImplementationOnce(async (input, transaction) => {
        await realAudit.recordActivity(input, transaction);
        throw new Error("Forced audit failure.");
      });

    try {
      await expect(
        service.createConfiguration({
          organizationId: organizationAId,
          configurationCode,
          configurationName: "Atomic approval",
          moduleName: "Foundation",
          entityName: "FoundationRecord",
          approvalRequired: true,
          approvalMode: "Single",
          submissionStatus: "Configured",
          status: "Active",
          createdById: creatorAId,
        }),
      ).rejects.toThrow("Forced audit failure.");
    } finally {
      recordActivity.mockRestore();
    }

    await expect(
      database.approvalConfiguration.count({
        where: { organizationId: organizationAId, configurationCode },
      }),
    ).resolves.toBe(0);
    await expect(
      database.activityLog.count({
        where: {
          organizationId: organizationAId,
          action: "ApprovalConfigurationCreated",
        },
      }),
    ).resolves.toBe(auditCountBefore);
  });
});
