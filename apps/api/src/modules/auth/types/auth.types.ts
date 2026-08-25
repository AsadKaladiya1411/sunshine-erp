export const USER_STATUSES = ["Active", "Inactive", "Disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_SESSION_STATUSES = [
  "Active",
  "LoggedOut",
  "Expired",
  "Revoked",
  "Compromised",
] as const;
export type UserSessionStatus = (typeof USER_SESSION_STATUSES)[number];

export const TOKEN_RETIREMENT_REASONS = [
  "Rotated",
  "LoggedOut",
  "Expired",
  "Revoked",
  "Compromised",
] as const;
export type TokenRetirementReason =
  (typeof TOKEN_RETIREMENT_REASONS)[number];

export interface AuthenticatedUserIdentity {
  readonly userId: string;
  readonly organizationId: string;
  readonly organizationCode: string;
  readonly organizationName: string;
  readonly departmentId: string;
  readonly departmentCode: string;
  readonly departmentName: string;
  readonly sessionId: string;
  readonly username: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string | null;
}

export interface LoginAccount {
  readonly userId: string;
  readonly organizationId: string;
  readonly passwordHash: string;
  readonly status: string;
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
  readonly maxConcurrentSessions: number | null;
}

export interface SessionAuthenticationRecord
  extends AuthenticatedUserIdentity {
  readonly sessionStatus: string;
  readonly expiresAt: Date;
  readonly userStatus: string;
  readonly lockedUntil: Date | null;
}

export interface PasswordAccount {
  readonly userId: string;
  readonly organizationId: string;
  readonly passwordHash: string;
  readonly historicalPasswordHashes: readonly string[];
}
