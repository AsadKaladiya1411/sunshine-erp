import type { RequestContext } from "../http/request-context.js";

export interface ActivityDeviceInfo {
  readonly platform?: string;
  readonly mobile?: boolean;
}

export interface ActivityRequestMetadata {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly deviceInfo?: ActivityDeviceInfo;
}

export interface ActivityLogRecord {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly module: string;
  readonly entityName: string;
  readonly recordId: string | null;
  readonly action: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly deviceInfo: ActivityDeviceInfo | null;
  readonly performedAt: Date;
  readonly remarks: string | null;
}

export interface RecordActivityInput extends ActivityRequestMetadata {
  readonly userId: string;
  readonly organizationId: string;
  readonly module: string;
  readonly entityName: string;
  readonly recordId?: string;
  readonly action: string;
  readonly performedAt?: Date;
  readonly remarks?: string;
}

export interface RecordAuthenticatedActivityInput
  extends ActivityRequestMetadata {
  readonly context: RequestContext | undefined;
  readonly module: string;
  readonly entityName: string;
  readonly recordId?: string;
  readonly action: string;
  readonly performedAt?: Date;
  readonly remarks?: string;
}

export const SECURITY_ACTIVITY_ACTIONS = Object.freeze({
  loginSucceeded: "LoginSucceeded",
  loginFailed: "LoginFailed",
  accountLocked: "AccountLocked",
  logout: "Logout",
  refreshTokenCompromised: "RefreshTokenCompromised",
  passwordChanged: "PasswordChanged",
  passwordResetCompleted: "PasswordResetCompleted",
  authorizationDenied: "AuthorizationDenied",
  roleAssigned: "RoleAssigned",
  roleRevoked: "RoleRevoked",
  rolePermissionAssigned: "RolePermissionAssigned",
  rolePermissionDeactivated: "RolePermissionDeactivated",
  permissionStatusChanged: "PermissionStatusChanged",
} as const);
