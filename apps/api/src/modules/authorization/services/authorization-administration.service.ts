import {
  AuditService,
  auditService,
} from "../../../core/audit/audit.service.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { SECURITY_ACTIVITY_ACTIONS } from "../../../core/audit/activity-log.types.js";
import {
  PermissionRepository,
  permissionRepository,
} from "../repositories/permission.repository.js";
import {
  RolePermissionRepository,
  rolePermissionRepository,
  type AssignPermissionToRoleInput,
} from "../repositories/role-permission.repository.js";
import {
  RoleRepository,
  roleRepository,
} from "../repositories/role.repository.js";
import {
  UserRoleAssignmentRepository,
  userRoleAssignmentRepository,
  type AssignRoleToUserInput,
} from "../repositories/user-role-assignment.repository.js";
import type {
  RoleAssignmentRecord,
  RolePermissionRecord,
} from "../types/authorization.types.js";

export interface ProvisionInitialAdministrationInput {
  readonly organizationId: string;
  readonly administratorUserId: string;
  readonly roleCode: string;
  readonly roleName: string;
  readonly roleDescription: string;
  readonly permissionCode: string;
  readonly permissionName: string;
  readonly permissionModule: string;
  readonly permissionResource: string;
  readonly permissionAction: string;
  readonly permissionDescription: string;
}

export interface ProvisionInitialAdministrationResult {
  readonly roleId: string;
  readonly permissionId: string;
  readonly rolePermissionId: string;
  readonly roleAssignmentId: string;
}

export class AuthorizationAdministrationService {
  constructor(
    private readonly permissions: PermissionRepository = permissionRepository,
    private readonly rolePermissions: RolePermissionRepository = rolePermissionRepository,
    private readonly roleAssignments: UserRoleAssignmentRepository = userRoleAssignmentRepository,
    private readonly audit: AuditService = auditService,
    private readonly roles: RoleRepository = roleRepository,
  ) {}

  async provisionInitialAdministration(
    input: ProvisionInitialAdministrationInput,
    database: Prisma.TransactionClient,
  ): Promise<ProvisionInitialAdministrationResult> {
    const role = await this.roles.create(
      {
        organizationId: input.organizationId,
        roleCode: input.roleCode,
        roleName: input.roleName,
        description: input.roleDescription,
        status: "Active",
        createdById: input.administratorUserId,
      },
      database,
    );
    await this.audit.recordActivity(
      {
        userId: input.administratorUserId,
        organizationId: input.organizationId,
        module: "Authorization",
        entityName: "Role",
        recordId: role.id,
        action: SECURITY_ACTIVITY_ACTIONS.roleCreated,
        remarks: "Initial administrator role created during bootstrap.",
      },
      database,
    );

    const permission = await this.permissions.create(
      {
        permissionCode: input.permissionCode,
        permissionName: input.permissionName,
        module: input.permissionModule,
        resource: input.permissionResource,
        action: input.permissionAction,
        description: input.permissionDescription,
        status: "Active",
        createdById: input.administratorUserId,
      },
      database,
    );
    await this.audit.recordActivity(
      {
        userId: input.administratorUserId,
        organizationId: input.organizationId,
        module: "Authorization",
        entityName: "Permission",
        recordId: permission.id,
        action: SECURITY_ACTIVITY_ACTIONS.permissionCreated,
        remarks: "Initial administration permission created during bootstrap.",
      },
      database,
    );

    const rolePermission = await this.rolePermissions.assignInTransaction(
      {
        organizationId: input.organizationId,
        roleId: role.id,
        permissionId: permission.id,
        assignedById: input.administratorUserId,
      },
      database,
      async (assignment, transaction) => {
        await this.audit.recordActivity(
          {
            userId: input.administratorUserId,
            organizationId: input.organizationId,
            module: "Authorization",
            entityName: "RolePermission",
            recordId: assignment.id,
            action: SECURITY_ACTIVITY_ACTIONS.rolePermissionAssigned,
            performedAt: assignment.assignedAt,
            remarks: "Initial administration permission assigned to role.",
          },
          transaction,
        );
      },
    );
    const roleAssignment = await this.roleAssignments.assignInTransaction(
      {
        organizationId: input.organizationId,
        userId: input.administratorUserId,
        roleId: role.id,
        createdById: input.administratorUserId,
      },
      database,
      async (assignment, transaction) => {
        await this.audit.recordActivity(
          {
            userId: input.administratorUserId,
            organizationId: input.organizationId,
            module: "Authorization",
            entityName: "RoleAssignment",
            recordId: assignment.id,
            action: SECURITY_ACTIVITY_ACTIONS.roleAssigned,
            performedAt: assignment.assignedAt,
            remarks: "Initial administrator role assigned during bootstrap.",
          },
          transaction,
        );
      },
    );

    if (!rolePermission || !roleAssignment) {
      throw new Error("Initial authorization provisioning failed safely.");
    }

    return Object.freeze({
      roleId: role.id,
      permissionId: permission.id,
      rolePermissionId: rolePermission.id,
      roleAssignmentId: roleAssignment.id,
    });
  }

  updatePermissionStatus(
    id: string,
    status: string,
    organizationId: string,
    updatedById: string,
  ): Promise<boolean> {
    return this.permissions.updateStatus(
      id,
      status,
      organizationId,
      updatedById,
      async (permissionId, database) => {
        await this.audit.recordActivity(
          {
            userId: updatedById,
            organizationId,
            module: "Authorization",
            entityName: "Permission",
            recordId: permissionId,
            action: SECURITY_ACTIVITY_ACTIONS.permissionStatusChanged,
            remarks: `Permission status changed to ${status}.`,
          },
          database,
        );
      },
    );
  }

  assignPermissionToRole(
    input: AssignPermissionToRoleInput,
  ): Promise<RolePermissionRecord | null> {
    return this.rolePermissions.assign(input, async (assignment, database) => {
      await this.audit.recordActivity(
        {
          userId: input.assignedById,
          organizationId: input.organizationId,
          module: "Authorization",
          entityName: "RolePermission",
          recordId: assignment.id,
          action: SECURITY_ACTIVITY_ACTIONS.rolePermissionAssigned,
          performedAt: assignment.assignedAt,
          remarks: "Permission assigned to role.",
        },
        database,
      );
    });
  }

  deactivateRolePermission(
    roleId: string,
    permissionId: string,
    organizationId: string,
    deactivatedById: string,
  ): Promise<boolean> {
    return this.rolePermissions.deactivate(
      roleId,
      permissionId,
      organizationId,
      deactivatedById,
      async (assignmentId, database) => {
        await this.audit.recordActivity(
          {
            userId: deactivatedById,
            organizationId,
            module: "Authorization",
            entityName: "RolePermission",
            recordId: assignmentId,
            action: SECURITY_ACTIVITY_ACTIONS.rolePermissionDeactivated,
            remarks: "Role permission deactivated.",
          },
          database,
        );
      },
    );
  }

  assignRoleToUser(
    input: AssignRoleToUserInput,
  ): Promise<RoleAssignmentRecord | null> {
    return this.roleAssignments.assign(input, async (assignment, database) => {
      await this.audit.recordActivity(
        {
          userId: input.createdById,
          organizationId: input.organizationId,
          module: "Authorization",
          entityName: "RoleAssignment",
          recordId: assignment.id,
          action: SECURITY_ACTIVITY_ACTIONS.roleAssigned,
          performedAt: assignment.assignedAt,
          remarks: "Role assigned to user.",
        },
        database,
      );
    });
  }

  revokeRoleAssignment(
    assignmentId: string,
    organizationId: string,
    updatedById: string,
  ): Promise<boolean> {
    return this.roleAssignments.revoke(
      assignmentId,
      organizationId,
      updatedById,
      async (revokedAssignmentId, database) => {
        await this.audit.recordActivity(
          {
            userId: updatedById,
            organizationId,
            module: "Authorization",
            entityName: "RoleAssignment",
            recordId: revokedAssignmentId,
            action: SECURITY_ACTIVITY_ACTIONS.roleRevoked,
            remarks: "Role assignment revoked.",
          },
          database,
        );
      },
    );
  }
}

export const authorizationAdministrationService =
  new AuthorizationAdministrationService();
