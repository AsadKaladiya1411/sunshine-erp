import { prisma } from "../../../core/database/prisma.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import {
  ACTIVE_AUTHORIZATION_STATUS,
  type RoleAssignmentRecord,
} from "../types/authorization.types.js";
import type { AuthorizationMutationHook } from "./authorization-mutation.types.js";

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
  constructor(private readonly database: PrismaClient = prisma) {}

  async assign(
    input: AssignRoleToUserInput,
    afterAssign?: AuthorizationMutationHook<RoleAssignmentRecord>,
  ): Promise<RoleAssignmentRecord | null> {
    const evaluatedAt = new Date();
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
      if (!user || !role || !actorIsValid) {
        return null;
      }

      await transaction.roleAssignment.updateMany({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          roleId: input.roleId,
          status: ACTIVE_AUTHORIZATION_STATUS,
          expiresAt: { lte: evaluatedAt },
        },
        data: {
          status: "Expired",
          updatedById: input.createdById,
        },
      });

      const activeAssignment = await transaction.roleAssignment.findFirst({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          roleId: input.roleId,
          status: ACTIVE_AUTHORIZATION_STATUS,
          OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }],
        },
        select: roleAssignmentSelection,
      });

      if (activeAssignment) {
        return {
          assignment: mapRoleAssignment(activeAssignment),
          created: false,
        };
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
      const mappedAssignment = mapRoleAssignment(assignment);
      await afterAssign?.(mappedAssignment, transaction);
      return { assignment: mappedAssignment, created: true };
    });
    if (!result) {
      return null;
    }
    return result.assignment;
  }

  async revoke(
    assignmentId: string,
    organizationId: string,
    updatedById: string,
    afterRevoke?: AuthorizationMutationHook<string>,
  ): Promise<boolean> {
    const result = await this.database.$transaction(async (transaction) => {
      const actor = await transaction.user.findFirst({
        where: { id: updatedById, organizationId },
        select: { id: true },
      });
      if (!actor) {
        return { count: 0 };
      }
      const updated = await transaction.roleAssignment.updateMany({
        where: {
          id: assignmentId,
          organizationId,
          status: ACTIVE_AUTHORIZATION_STATUS,
        },
        data: { status: "Revoked", updatedById },
      });
      if (updated.count === 1) {
        await afterRevoke?.(assignmentId, transaction);
      }
      return updated;
    });
    if (result.count !== 1) {
      return false;
    }
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

export const userRoleAssignmentRepository = new UserRoleAssignmentRepository();
