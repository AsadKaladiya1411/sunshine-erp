import { env } from "@sunshine-erp/config";
import { AuthenticationError, SessionLimitError } from "../../../core/http/errors.js";
import type { RefreshTokenCredential } from "../../../core/auth/refresh-token.service.js";
import {
  authRepository,
  type AuthRepository,
} from "../repositories/auth.repository.js";
import type { AuthenticatedUserIdentity } from "../types/auth.types.js";

export interface CreateSessionInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly refreshCredential: RefreshTokenCredential;
  readonly now: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export class SessionService {
  constructor(private readonly repository: AuthRepository = authRepository) {}

  async create(input: CreateSessionInput): Promise<string> {
    const result = await this.repository.createLoginSession({
      userId: input.userId,
      organizationId: input.organizationId,
      tokenHash: input.refreshCredential.tokenHash,
      issuedAt: input.refreshCredential.issuedAt,
      expiresAt: input.refreshCredential.expiresAt,
      now: input.now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      defaultMaxConcurrentSessions: env.DEFAULT_MAX_CONCURRENT_SESSIONS,
    });

    if (result.kind === "limit") {
      throw new SessionLimitError();
    }

    if (result.kind === "denied") {
      throw new AuthenticationError();
    }

    return result.sessionId;
  }

  async validate(
    sessionId: string,
    userId: string,
    organizationId: string,
    now = new Date(),
  ): Promise<AuthenticatedUserIdentity> {
    const session = await this.repository.getSessionForAuthentication(sessionId);

    if (
      !session ||
      session.userId !== userId ||
      session.organizationId !== organizationId ||
      session.sessionStatus !== "Active" ||
      session.userStatus !== "Active" ||
      (session.lockedUntil !== null && session.lockedUntil > now)
    ) {
      throw new AuthenticationError();
    }

    if (session.expiresAt <= now) {
      await this.repository.markSessionExpired(sessionId, now);
      throw new AuthenticationError();
    }

    await this.repository.updateSessionActivity(sessionId, now);

    return Object.freeze({
      userId: session.userId,
      organizationId: session.organizationId,
      organizationCode: session.organizationCode,
      organizationName: session.organizationName,
      departmentId: session.departmentId,
      departmentCode: session.departmentCode,
      departmentName: session.departmentName,
      sessionId: session.sessionId,
      username: session.username,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
    });
  }

  async rotate(
    presentedTokenHash: string,
    replacementCredential: RefreshTokenCredential,
    now = new Date(),
  ): Promise<AuthenticatedUserIdentity | "reused" | null> {
    const result = await this.repository.rotateRefreshSession({
      presentedTokenHash,
      replacementTokenHash: replacementCredential.tokenHash,
      replacementIssuedAt: replacementCredential.issuedAt,
      replacementExpiresAt: replacementCredential.expiresAt,
      now,
    });

    if (result.kind === "rotated") {
      return result.identity;
    }

    return result.kind === "reused" ? "reused" : null;
  }

  logout(sessionId: string, now = new Date()): Promise<void> {
    return this.repository.logoutSession(sessionId, now);
  }
}

export const sessionService = new SessionService();
