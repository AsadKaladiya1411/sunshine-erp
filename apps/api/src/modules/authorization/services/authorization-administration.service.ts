import {
  AuditService,
  auditService,
} from "../../../core/audit/audit.service.js";
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
  UserRoleAssignmentRepository,
  userRoleAssignmentRepository,
  type AssignRoleToUserInput,
} from "../repositories/user-role-assignment.repository.js";
import type {
  RoleAssignmentRecord,
  RolePermissionRecord,
} from "../types/authorization.types.js";

export class AuthorizationAdministrationService {
  constructor(
    private readonly permissions: PermissionRepository = permissionRepository,
    private readonly rolePermissions: RolePermissionRepository =
      rolePermissionRepository,
    private readonly roleAssignments: UserRoleAssignmentRepository =
      userRoleAssignmentRepository,
    private readonly audit: AuditService = auditService,
  ) {}

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
    return this.rolePermissions.assign(
      input,
      async (assignment, database) => {
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
      },
    );
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
    return this.roleAssignments.assign(
      input,
      async (assignment, database) => {
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
      },
    );
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
