import { AuthorizationError } from "../../../core/http/errors.js";
import { logger } from "../../../core/logging/logger.js";
import { userRoleAssignmentRepository } from "../repositories/user-role-assignment.repository.js";

export interface EffectivePermissionReader {
  getEffectivePermissionCodes(
    userId: string,
    organizationId: string,
  ): Promise<readonly string[]>;
}

export interface ActiveRoleReader {
  findActiveAssignments(
    userId: string,
    organizationId: string,
  ): Promise<readonly { readonly roleId: string }[]>;
}

export class AuthorizationService {
  constructor(
    private readonly permissionReader: EffectivePermissionReader =
      userRoleAssignmentRepository,
    private readonly activeRoleReader: ActiveRoleReader =
      userRoleAssignmentRepository,
  ) {}

  async hasActiveRole(
    userId: string,
    organizationId: string,
    roleId: string,
  ): Promise<boolean> {
    const assignments = await this.activeRoleReader.findActiveAssignments(
      userId,
      organizationId,
    );
    return assignments.some((assignment) => assignment.roleId === roleId);
  }

  async getEffectivePermissions(
    userId: string,
    organizationId: string,
  ): Promise<ReadonlySet<string>> {
    try {
      const permissions = await this.permissionReader.getEffectivePermissionCodes(
        userId,
        organizationId,
      );
      return new Set(permissions);
    } catch (error: unknown) {
      logger.error(
        { err: error, userId, organizationId },
        "Authorization permission resolution failed",
      );
      return new Set<string>();
    }
  }

  async hasPermission(
    userId: string,
    organizationId: string,
    permission: string,
  ): Promise<boolean> {
    if (permission.length === 0) {
      return false;
    }
    const permissions = await this.getEffectivePermissions(
      userId,
      organizationId,
    );
    return permissions.has(permission);
  }

  async hasAnyPermission(
    userId: string,
    organizationId: string,
    permissions: readonly string[],
  ): Promise<boolean> {
    if (permissions.length === 0) {
      return false;
    }
    const effectivePermissions = await this.getEffectivePermissions(
      userId,
      organizationId,
    );
    return permissions.some((permission) => effectivePermissions.has(permission));
  }

  async hasAllPermissions(
    userId: string,
    organizationId: string,
    permissions: readonly string[],
  ): Promise<boolean> {
    if (permissions.length === 0) {
      return false;
    }
    const effectivePermissions = await this.getEffectivePermissions(
      userId,
      organizationId,
    );
    return permissions.every((permission) => effectivePermissions.has(permission));
  }

  async requirePermission(
    userId: string,
    organizationId: string,
    permission: string,
  ): Promise<void> {
    if (!(await this.hasPermission(userId, organizationId, permission))) {
      throw new AuthorizationError();
    }
  }
}

export const authorizationService = new AuthorizationService();
