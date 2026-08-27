import { env } from "@sunshine-erp/config";
import {
  auditService,
  type AuditService,
} from "../../../core/audit/audit.service.js";
import {
  SECURITY_ACTIVITY_ACTIONS,
  type ActivityRequestMetadata,
} from "../../../core/audit/activity-log.types.js";
import {
  accessTokenService,
  type AccessTokenService,
} from "../../../core/auth/access-token.service.js";
import {
  passwordResetTokenService,
  type PasswordResetTokenService,
} from "../../../core/auth/password-reset-token.service.js";
import {
  passwordService,
  type PasswordService,
} from "../../../core/auth/password.service.js";
import {
  refreshTokenService,
  type RefreshTokenService,
} from "../../../core/auth/refresh-token.service.js";
import {
  AuthenticationError,
  InvalidCredentialsError,
  InvalidPasswordResetTokenError,
  InvalidRefreshTokenError,
} from "../../../core/http/errors.js";
import {
  authRepository,
  type AuthRepository,
} from "../repositories/auth.repository.js";
import type { AuthenticatedUserIdentity } from "../types/auth.types.js";
import {
  sessionService,
  type SessionService,
} from "./session.service.js";

const dummyPasswordHash =
  "$2b$12$DKHbVzn3kkKcGzRqZbVgwuixDaeMldptl2j4ZiHJe6yFkWBMeTC.S";

export interface LoginInput extends ActivityRequestMetadata {
  readonly organizationCode: string;
  readonly username?: string;
  readonly email?: string;
  readonly password: string;
}

export interface AuthenticationTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresIn: number;
}

export interface LoginResult extends AuthenticationTokens {
  readonly user: AuthenticatedUserIdentity;
}

export class AuthenticationService {
  constructor(
    private readonly repository: AuthRepository = authRepository,
    private readonly passwords: PasswordService = passwordService,
    private readonly accessTokens: AccessTokenService = accessTokenService,
    private readonly refreshTokens: RefreshTokenService = refreshTokenService,
    private readonly sessions: SessionService = sessionService,
    private readonly resetTokens: PasswordResetTokenService =
      passwordResetTokenService,
    private readonly audit: AuditService = auditService,
  ) {}

  async login(input: LoginInput, now = new Date()): Promise<LoginResult> {
    const account = await this.repository.findUserForLogin(input);

    if (!account) {
      await this.passwords.verify(input.password, dummyPasswordHash);
      throw new InvalidCredentialsError();
    }

    if (account.lockedUntil !== null && account.lockedUntil <= now) {
      await this.repository.clearExpiredLock(account.userId, now);
    }

    const passwordMatches = await this.passwords.verify(
      input.password,
      account.passwordHash,
    );
    const temporarilyLocked =
      account.lockedUntil !== null && account.lockedUntil > now;

    if (
      !passwordMatches ||
      account.status !== "Active" ||
      temporarilyLocked
    ) {
      let accountLockCreated = false;
      if (
        !passwordMatches &&
        account.status === "Active" &&
        !temporarilyLocked
      ) {
        const failedLogin = await this.repository.recordFailedLogin(
          account.userId,
          now,
          env.ACCOUNT_LOCK_FAILED_ATTEMPTS,
          env.ACCOUNT_LOCK_DURATION_MS,
        );
        accountLockCreated =
          account.failedLoginAttempts < env.ACCOUNT_LOCK_FAILED_ATTEMPTS &&
          failedLogin.lockedUntil !== null;
      }

      await this.audit.recordActivity({
        userId: account.userId,
        organizationId: account.organizationId,
        module: "Authentication",
        entityName: "User",
        recordId: account.userId,
        action: SECURITY_ACTIVITY_ACTIONS.loginFailed,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        deviceInfo: input.deviceInfo,
        performedAt: now,
        remarks: "Login attempt was denied.",
      });
      if (accountLockCreated) {
        await this.audit.recordActivity({
          userId: account.userId,
          organizationId: account.organizationId,
          module: "Authentication",
          entityName: "User",
          recordId: account.userId,
          action: SECURITY_ACTIVITY_ACTIONS.accountLocked,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          deviceInfo: input.deviceInfo,
          performedAt: now,
          remarks: "Account locked after repeated failed login attempts.",
        });
      }

      throw new InvalidCredentialsError();
    }

    const refreshCredential = this.refreshTokens.generate(now);
    const sessionId = await this.sessions.create({
      userId: account.userId,
      organizationId: account.organizationId,
      refreshCredential,
      now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    const user = await this.sessions.validate(
      sessionId,
      account.userId,
      account.organizationId,
      now,
    );
    const accessToken = await this.accessTokens.sign({
      userId: account.userId,
      organizationId: account.organizationId,
      sessionId,
    });
    await this.audit.recordActivity({
      userId: account.userId,
      organizationId: account.organizationId,
      module: "Authentication",
      entityName: "UserSession",
      recordId: sessionId,
      action: SECURITY_ACTIVITY_ACTIONS.loginSucceeded,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      deviceInfo: input.deviceInfo,
      performedAt: now,
      remarks: "Login succeeded.",
    });

    return Object.freeze({
      accessToken,
      refreshToken: refreshCredential.token,
      accessTokenExpiresIn: this.accessTokens.lifetimeSeconds,
      user,
    });
  }

  async refresh(
    refreshToken: string,
    metadata: ActivityRequestMetadata = {},
    now = new Date(),
  ): Promise<AuthenticationTokens> {
    const presentedTokenHash = this.refreshTokens.digest(refreshToken);
    const replacementCredential = this.refreshTokens.generate(now);
    const identity = await this.sessions.rotate(
      presentedTokenHash,
      replacementCredential,
      now,
    );

    if (!identity) {
      throw new InvalidRefreshTokenError();
    }
    if ("kind" in identity) {
      await this.audit.recordActivity({
        userId: identity.identity.userId,
        organizationId: identity.identity.organizationId,
        module: "Authentication",
        entityName: "UserSession",
        recordId: identity.identity.sessionId,
        action: SECURITY_ACTIVITY_ACTIONS.refreshTokenCompromised,
        ...metadata,
        performedAt: now,
        remarks: "Refresh credential reuse compromised the session.",
      });
      throw new InvalidRefreshTokenError();
    }

    const accessToken = await this.accessTokens.sign(identity);

    return Object.freeze({
      accessToken,
      refreshToken: replacementCredential.token,
      accessTokenExpiresIn: this.accessTokens.lifetimeSeconds,
    });
  }

  async logout(
    sessionId: string,
    userId: string,
    organizationId: string,
    metadata: ActivityRequestMetadata = {},
    now = new Date(),
  ): Promise<void> {
    await this.sessions.logout(sessionId, now);
    await this.audit.recordActivity({
      userId,
      organizationId,
      module: "Authentication",
      entityName: "UserSession",
      recordId: sessionId,
      action: SECURITY_ACTIVITY_ACTIONS.logout,
      ...metadata,
      performedAt: now,
      remarks: "Session logged out.",
    });
  }

  getCurrentUser(
    sessionId: string,
    userId: string,
    organizationId: string,
  ): Promise<AuthenticatedUserIdentity> {
    return this.sessions.validate(sessionId, userId, organizationId);
  }

  async changePassword(
    userId: string,
    organizationId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    metadata: ActivityRequestMetadata = {},
    now = new Date(),
  ): Promise<void> {
    const account = await this.repository.getPasswordAccount(
      userId,
      organizationId,
      env.PASSWORD_HISTORY_DEPTH,
    );

    if (
      !account ||
      !(await this.passwords.verify(currentPassword, account.passwordHash))
    ) {
      throw new AuthenticationError("Current password is invalid.");
    }

    await this.passwords.assertNotReused(
      newPassword,
      account.passwordHash,
      account.historicalPasswordHashes,
    );
    const newPasswordHash = await this.passwords.hash(newPassword);
    const changed = await this.repository.changePassword({
      userId,
      organizationId,
      currentSessionId,
      expectedPasswordHash: account.passwordHash,
      newPasswordHash,
      now,
    });

    if (!changed) {
      throw new AuthenticationError();
    }
    await this.audit.recordActivity({
      userId,
      organizationId,
      module: "Authentication",
      entityName: "User",
      recordId: userId,
      action: SECURITY_ACTIVITY_ACTIONS.passwordChanged,
      ...metadata,
      performedAt: now,
      remarks: "Password changed.",
    });
  }

  async createPasswordResetCredential(
    userId: string,
    organizationId: string,
    now = new Date(),
  ): Promise<string> {
    const credential = this.resetTokens.generate(now);
    await this.repository.createPasswordResetToken({
      userId,
      organizationId,
      tokenHash: credential.tokenHash,
      expiresAt: credential.expiresAt,
      now,
    });
    return credential.token;
  }

  async resetPassword(
    token: string,
    newPassword: string,
    metadata: ActivityRequestMetadata = {},
    now = new Date(),
  ): Promise<void> {
    const tokenHash = this.resetTokens.digest(token);
    const account = await this.repository.getPasswordResetAccount(
      tokenHash,
      now,
      env.PASSWORD_HISTORY_DEPTH,
    );

    if (!account) {
      throw new InvalidPasswordResetTokenError();
    }

    await this.passwords.assertNotReused(
      newPassword,
      account.passwordHash,
      account.historicalPasswordHashes,
    );
    const newPasswordHash = await this.passwords.hash(newPassword);
    const reset = await this.repository.completePasswordReset({
      resetTokenId: account.resetTokenId,
      userId: account.userId,
      organizationId: account.organizationId,
      expectedPasswordHash: account.passwordHash,
      newPasswordHash,
      now,
    });

    if (!reset) {
      throw new InvalidPasswordResetTokenError();
    }
    await this.audit.recordActivity({
      userId: account.userId,
      organizationId: account.organizationId,
      module: "Authentication",
      entityName: "User",
      recordId: account.userId,
      action: SECURITY_ACTIVITY_ACTIONS.passwordResetCompleted,
      ...metadata,
      performedAt: now,
      remarks: "Password reset completed.",
    });
  }
}

export const authenticationService = new AuthenticationService();
