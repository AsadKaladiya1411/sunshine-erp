import { prisma } from "../../../core/database/prisma.js";
import {
  AuditService,
} from "../../../core/audit/audit.service.js";
import { ActivityLogRepository } from "../../../core/audit/activity-log.repository.js";
import { SECURITY_ACTIVITY_ACTIONS } from "../../../core/audit/activity-log.types.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import {
  ACTIVE_AUTHORIZATION_STATUS,
  type RoleAssignmentRecord,
} from "../types/authorization.types.js";

export interface AssignRoleToUserInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly assignedAt?: Date;
  readonly expiresAt?: Date | null;
  readonly createdById: string;
}

function mapRoleAssignment(
  assignment: RoleAssignmentRecord,
): RoleAssignmentRecord {
  return Object.freeze({ ...assignment });
}

const roleAssignmentSelection = {
  id: true,
  organizationId: true,
  userId: true,
  roleId: true,
  assignedAt: true,
  expiresAt: true,
  status: true,
  createdAt: true,
} as const;

export class UserRoleAssignmentRepository {
  private readonly audit: AuditService;

  constructor(
    private readonly database: PrismaClient = prisma,
    audit?: AuditService,
  ) {
    this.audit =
      audit ?? new AuditService(new ActivityLogRepository(this.database));
  }

  async assign(
    input: AssignRoleToUserInput,
  ): Promise<RoleAssignmentRecord | null> {
    const result = await this.database.$transaction(async (transaction) => {
      const user = await transaction.user.findFirst({
        where: {
          id: input.userId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      const role = await transaction.role.findFirst({
        where: {
          id: input.roleId,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });
      const actorIsValid = Boolean(
        await transaction.user.findFirst({
          where: {
            id: input.createdById,
            organizationId: input.organizationId,
          },
          select: { id: true },
        }),
      );
      const activeAssignment = await transaction.roleAssignment.findFirst({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          roleId: input.roleId,
          status: ACTIVE_AUTHORIZATION_STATUS,
        },
        select: roleAssignmentSelection,
      });

      if (!user || !role || !actorIsValid) {
        return null;
      }

      if (activeAssignment) {
        return { assignment: mapRoleAssignment(activeAssignment), created: false };
      }

      const assignment = await transaction.roleAssignment.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          roleId: input.roleId,
          assignedAt: input.assignedAt,
          expiresAt: input.expiresAt,
          status: ACTIVE_AUTHORIZATION_STATUS,
          createdById: input.createdById,
        },
        select: roleAssignmentSelection,
      });
      return { assignment: mapRoleAssignment(assignment), created: true };
    });
    if (!result) {
      return null;
    }
    if (result.created) {
      await this.audit.recordActivity({
        userId: input.createdById,
        organizationId: input.organizationId,
        module: "Authorization",
        entityName: "RoleAssignment",
        recordId: result.assignment.id,
        action: SECURITY_ACTIVITY_ACTIONS.roleAssigned,
        performedAt: result.assignment.assignedAt,
        remarks: "Role assigned to user.",
      });
    }
    return result.assignment;
  }

  async revoke(
    assignmentId: string,
    organizationId: string,
    updatedById: string,
  ): Promise<boolean> {
    const result = await this.database.$transaction(async (transaction) => {
      const actor = await transaction.user.findFirst({
        where: { id: updatedById, organizationId },
        select: { id: true },
      });
      if (!actor) {
        return { count: 0 };
      }
      return transaction.roleAssignment.updateMany({
        where: {
          id: assignmentId,
          organizationId,
          status: ACTIVE_AUTHORIZATION_STATUS,
        },
        data: { status: "Revoked", updatedById },
      });
    });
    if (result.count !== 1) {
      return false;
    }
    await this.audit.recordActivity({
      userId: updatedById,
      organizationId,
      module: "Authorization",
      entityName: "RoleAssignment",
      recordId: assignmentId,
      action: SECURITY_ACTIVITY_ACTIONS.roleRevoked,
      remarks: "Role assignment revoked.",
    });
    return true;
  }

  async listUserRoles(
    userId: string,
    organizationId: string,
  ): Promise<readonly RoleAssignmentRecord[]> {
    const assignments = await this.database.roleAssignment.findMany({
      where: { userId, organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: roleAssignmentSelection,
    });
    return Object.freeze(assignments.map(mapRoleAssignment));
  }

  async findActiveAssignments(
    userId: string,
    organizationId: string,
  ): Promise<readonly RoleAssignmentRecord[]> {
    const now = new Date();
    const assignments = await this.database.roleAssignment.findMany({
      where: {
        userId,
        organizationId,
        status: ACTIVE_AUTHORIZATION_STATUS,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        role: { status: ACTIVE_AUTHORIZATION_STATUS },
      },
      orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
      select: roleAssignmentSelection,
    });
    return Object.freeze(assignments.map(mapRoleAssignment));
  }

  async getEffectivePermissionCodes(
    userId: string,
    organizationId: string,
  ): Promise<readonly string[]> {
    const userExists = await this.database.user.count({
      where: { id: userId, organizationId },
    });

    if (userExists !== 1) {
      return Object.freeze([]);
    }

    const now = new Date();
    const assignments = await this.database.roleAssignment.findMany({
      where: {
        userId,
        organizationId,
        status: ACTIVE_AUTHORIZATION_STATUS,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        role: { status: ACTIVE_AUTHORIZATION_STATUS, organizationId },
      },
      select: {
        role: {
          select: {
            rolePermissions: {
              where: {
                status: ACTIVE_AUTHORIZATION_STATUS,
                permission: { status: ACTIVE_AUTHORIZATION_STATUS },
              },
              select: {
                permission: { select: { permissionCode: true } },
              },
            },
          },
        },
      },
    });

    const permissionCodes = new Set<string>();
    for (const assignment of assignments) {
      for (const rolePermission of assignment.role.rolePermissions) {
        permissionCodes.add(rolePermission.permission.permissionCode);
      }
    }
    return Object.freeze([...permissionCodes].sort());
  }
}

export const userRoleAssignmentRepository =
  new UserRoleAssignmentRepository();
