export const ACTIVE_AUTHORIZATION_STATUS = "Active" as const;

export interface RoleRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly roleCode: string;
  readonly roleName: string;
  readonly description: string | null;
  readonly status: string;
}

export interface PermissionRecord {
  readonly id: string;
  readonly permissionCode: string;
  readonly permissionName: string;
  readonly module: string;
  readonly resource: string | null;
  readonly action: string;
  readonly description: string | null;
  readonly status: string;
}

export interface RolePermissionRecord {
  readonly id: string;
  readonly roleId: string;
  readonly permissionId: string;
  readonly assignedById: string;
  readonly assignedAt: Date;
  readonly status: string;
}

export interface RoleAssignmentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly assignedAt: Date;
  readonly expiresAt: Date | null;
  readonly status: string;
  readonly createdAt: Date;
}
