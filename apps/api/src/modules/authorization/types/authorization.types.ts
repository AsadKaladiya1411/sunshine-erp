export const AUTHORIZATION_STATUSES = ["Active", "Inactive"] as const;
export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export const ROLE_ASSIGNMENT_STATUSES = [
  "Active",
  "Inactive",
  "Expired",
  "Revoked",
] as const;
export type RoleAssignmentStatus = (typeof ROLE_ASSIGNMENT_STATUSES)[number];

export const ACTIVE_AUTHORIZATION_STATUS = "Active" as const;

export interface RoleRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly roleCode: string;
  readonly roleName: string;
  readonly description: string | null;
  readonly status: AuthorizationStatus;
}

export interface PermissionRecord {
  readonly id: string;
  readonly permissionCode: string;
  readonly permissionName: string;
  readonly module: string;
  readonly resource: string | null;
  readonly action: string;
  readonly description: string | null;
  readonly status: AuthorizationStatus;
}

export interface RolePermissionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly roleId: string;
  readonly permissionId: string;
  readonly assignedById: string;
  readonly assignedAt: Date;
  readonly status: AuthorizationStatus;
}

export interface RoleAssignmentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly assignedAt: Date;
  readonly expiresAt: Date | null;
  readonly status: RoleAssignmentStatus;
  readonly createdAt: Date;
}
