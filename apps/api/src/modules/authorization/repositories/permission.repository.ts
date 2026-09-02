import { prisma } from "../../../core/database/prisma.js";
import type { PrismaClient } from "../../../generated/prisma/client.js";
import type { PermissionRecord } from "../types/authorization.types.js";
import type { AuthorizationMutationHook } from "./authorization-mutation.types.js";

export interface CreatePermissionInput {
  readonly permissionCode: string;
  readonly permissionName: string;
  readonly module: string;
  readonly resource?: string;
  readonly action: string;
  readonly description?: string;
  readonly status: string;
  readonly createdById?: string;
}

function mapPermission(permission: PermissionRecord): PermissionRecord {
  return Object.freeze({ ...permission });
}

const permissionSelection = {
  id: true,
  permissionCode: true,
  permissionName: true,
  module: true,
  resource: true,
  action: true,
  description: true,
  status: true,
} as const;

export class PermissionRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async findById(id: string): Promise<PermissionRecord | null> {
    const permission = await this.database.permission.findUnique({
      where: { id },
      select: permissionSelection,
    });
    return permission ? mapPermission(permission) : null;
  }

  async findByCode(permissionCode: string): Promise<PermissionRecord | null> {
    const permission = await this.database.permission.findUnique({
      where: { permissionCode },
      select: permissionSelection,
    });
    return permission ? mapPermission(permission) : null;
  }

  async list(search?: string): Promise<readonly PermissionRecord[]> {
    const permissions = await this.database.permission.findMany({
      where: search
        ? {
            OR: [
              { permissionCode: { contains: search, mode: "insensitive" } },
              { permissionName: { contains: search, mode: "insensitive" } },
              { module: { contains: search, mode: "insensitive" } },
              { resource: { contains: search, mode: "insensitive" } },
              { action: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: [{ module: "asc" }, { action: "asc" }, { id: "asc" }],
      select: permissionSelection,
    });
    return Object.freeze(permissions.map(mapPermission));
  }

  async create(input: CreatePermissionInput): Promise<PermissionRecord> {
    const permission = await this.database.permission.create({
      data: input,
      select: permissionSelection,
    });
    return mapPermission(permission);
  }

  async updateStatus(
    id: string,
    status: string,
    organizationId: string,
    updatedById: string,
    afterUpdate?: AuthorizationMutationHook<string>,
  ): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const actor = await transaction.user.findFirst({
        where: { id: updatedById, organizationId },
        select: { id: true },
      });
      if (!actor) {
        return false;
      }
      const result = await transaction.permission.updateMany({
        where: { id },
        data: { status, updatedById },
      });
      if (result.count !== 1) {
        return false;
      }
      await afterUpdate?.(id, transaction);
      return true;
    });
  }
}

export const permissionRepository = new PermissionRepository();
