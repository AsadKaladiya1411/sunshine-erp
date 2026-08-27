import { prisma } from "../../../core/database/prisma.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import {
  ACTIVE_AUTHORIZATION_STATUS,
  type RolePermissionRecord,
} from "../types/authorization.types.js";

export interface AssignPermissionToRoleInput {
  readonly organizationId: string;
  readonly roleId: string;
  readonly permissionId: string;
  readonly assignedById: string;
  readonly assignedAt?: Date;
}

function mapRolePermission(
  assignment: RolePermissionRecord,
): RolePermissionRecord {
  return Object.freeze({ ...assignment });
}

const rolePermissionSelection = {
  id: true,
  roleId: true,
  permissionId: true,
  assignedById: true,
  assignedAt: true,
  status: true,
} as const;

export class RolePermissionRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async assign(
    input: AssignPermissionToRoleInput,
  ): Promise<RolePermissionRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const role = await transaction.role.findFirst({
        where: { id: input.roleId, organizationId: input.organizationId },
        select: { id: true },
      });
      const permission = await transaction.permission.findUnique({
        where: { id: input.permissionId },
        select: { id: true },
      });
      const assigningUser = await transaction.user.findFirst({
        where: {
          id: input.assignedById,
          organizationId: input.organizationId,
        },
        select: { id: true },
      });

      if (!role || !permission || !assigningUser) {
        return null;
      }

      const assignment = await transaction.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: input.roleId,
            permissionId: input.permissionId,
          },
        },
        create: {
          roleId: input.roleId,
          permissionId: input.permissionId,
          assignedById: input.assignedById,
          assignedAt: input.assignedAt,
          status: ACTIVE_AUTHORIZATION_STATUS,
        },
        update: {
          assignedById: input.assignedById,
          assignedAt: input.assignedAt ?? new Date(),
          status: ACTIVE_AUTHORIZATION_STATUS,
        },
        select: rolePermissionSelection,
      });

      return mapRolePermission(assignment);
    });
  }

  async deactivate(
    roleId: string,
    permissionId: string,
    organizationId: string,
  ): Promise<boolean> {
    const result = await this.database.rolePermission.updateMany({
      where: {
        roleId,
        permissionId,
        role: { organizationId },
        status: ACTIVE_AUTHORIZATION_STATUS,
      },
      data: { status: "Inactive" },
    });
    return result.count === 1;
  }

  async listByRole(
    roleId: string,
    organizationId: string,
  ): Promise<readonly RolePermissionRecord[]> {
    const assignments = await this.database.rolePermission.findMany({
      where: { roleId, role: { organizationId } },
      orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
      select: rolePermissionSelection,
    });
    return Object.freeze(assignments.map(mapRolePermission));
  }
}

export const rolePermissionRepository = new RolePermissionRepository();
