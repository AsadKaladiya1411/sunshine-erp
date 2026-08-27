import { prisma } from "../../../core/database/prisma.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { RoleRecord } from "../types/authorization.types.js";

export interface CreateRoleInput {
  readonly organizationId: string;
  readonly roleCode: string;
  readonly roleName: string;
  readonly description?: string;
  readonly status: string;
  readonly createdById?: string;
}

function mapRole(role: RoleRecord): RoleRecord {
  return Object.freeze({ ...role });
}

export class RoleRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async findById(
    id: string,
    organizationId: string,
  ): Promise<RoleRecord | null> {
    const role = await this.database.role.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        organizationId: true,
        roleCode: true,
        roleName: true,
        description: true,
        status: true,
      },
    });

    return role ? mapRole(role) : null;
  }

  async listByOrganization(
    organizationId: string,
  ): Promise<readonly RoleRecord[]> {
    const roles = await this.database.role.findMany({
      where: { organizationId },
      orderBy: [{ roleName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        organizationId: true,
        roleCode: true,
        roleName: true,
        description: true,
        status: true,
      },
    });

    return Object.freeze(roles.map(mapRole));
  }

  async create(input: CreateRoleInput): Promise<RoleRecord> {
    const role = await this.database.role.create({
      data: input,
      select: {
        id: true,
        organizationId: true,
        roleCode: true,
        roleName: true,
        description: true,
        status: true,
      },
    });

    return mapRole(role);
  }

  async updateStatus(
    id: string,
    organizationId: string,
    status: string,
    updatedById?: string,
  ): Promise<boolean> {
    const result = await this.database.role.updateMany({
      where: { id, organizationId },
      data: { status, updatedById },
    });
    return result.count === 1;
  }

  async hasAssignments(id: string, organizationId: string): Promise<boolean> {
    const count = await this.database.roleAssignment.count({
      where: { roleId: id, organizationId },
    });
    return count > 0;
  }
}

export const roleRepository = new RoleRepository();
