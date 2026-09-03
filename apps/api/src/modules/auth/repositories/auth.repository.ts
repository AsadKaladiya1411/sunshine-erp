import { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import { prisma } from "../../../core/database/prisma.js";
import type { ActivityLogDatabase } from "../../../core/audit/activity-log.repository.js";
import type {
  AuthenticatedUserIdentity,
  LoginAccount,
  PasswordAccount,
  SessionAuthenticationRecord,
  TokenRetirementReason,
} from "../types/auth.types.js";

type TransactionClient = Prisma.TransactionClient;

export type AuthMutationAudit<TResult> = (
  result: TResult,
  database: ActivityLogDatabase,
) => Promise<void>;

interface LoginIdentityInput {
  readonly organizationCode: string;
  readonly username?: string;
  readonly email?: string;
}

interface CreateLoginSessionInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly tokenHash: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly now: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly defaultMaxConcurrentSessions: number;
}

export type CreateLoginSessionResult =
  | { readonly kind: "created"; readonly sessionId: string }
  | { readonly kind: "limit" }
  | { readonly kind: "denied" };

interface RotateSessionInput {
  readonly presentedTokenHash: string;
  readonly replacementTokenHash: string;
  readonly replacementIssuedAt: Date;
  readonly replacementExpiresAt: Date;
  readonly now: Date;
}

export type RotateSessionResult =
  | {
      readonly kind: "rotated";
      readonly identity: AuthenticatedUserIdentity;
    }
  | {
      readonly kind: "reused";
      readonly identity: AuthenticatedUserIdentity;
    }
  | { readonly kind: "invalid" };

export interface FailedLoginResult {
  readonly failedLoginAttempts: number;
  readonly lockedUntil: Date | null;
}

interface ChangePasswordInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly currentSessionId: string;
  readonly expectedPasswordHash: string;
  readonly newPasswordHash: string;
  readonly now: Date;
}

interface CreatePasswordResetTokenInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

interface CompletePasswordResetInput {
  readonly resetTokenId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly expectedPasswordHash: string;
  readonly newPasswordHash: string;
  readonly now: Date;
}

function mapIdentity(session: {
  id: string;
  organizationId: string;
  user: {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string | null;
    organization: {
      organizationCode: string;
      organizationName: string;
    };
    department: {
      id: string;
      departmentCode: string;
      departmentName: string;
    };
  };
}): AuthenticatedUserIdentity {
  return Object.freeze({
    userId: session.user.id,
    organizationId: session.organizationId,
    organizationCode: session.user.organization.organizationCode,
    organizationName: session.user.organization.organizationName,
    departmentId: session.user.department.id,
    departmentCode: session.user.department.departmentCode,
    departmentName: session.user.department.departmentName,
    sessionId: session.id,
    username: session.user.username,
    email: session.user.email,
    firstName: session.user.firstName,
    lastName: session.user.lastName,
  });
}

const identitySelection = {
  id: true,
  organizationId: true,
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      lockedUntil: true,
      organization: {
        select: {
          organizationCode: true,
          organizationName: true,
        },
      },
      department: {
        select: {
          id: true,
          departmentCode: true,
          departmentName: true,
        },
      },
    },
  },
} as const;

async function lockUser(
  transaction: TransactionClient,
  userId: string,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`,
  );
}

async function lockSession(
  transaction: TransactionClient,
  sessionId: string,
): Promise<void> {
  await transaction.$queryRaw(
    Prisma.sql`SELECT "id" FROM "user_sessions" WHERE "id" = ${sessionId}::uuid FOR UPDATE`,
  );
}

async function retireCurrentToken(
  transaction: TransactionClient,
  session: {
    id: string;
    organizationId: string;
    sessionTokenHash: string;
    currentTokenIssuedAt: Date;
    expiresAt: Date;
  },
  reason: TokenRetirementReason,
  retiredAt: Date,
): Promise<void> {
  const existingHistory = await transaction.userSessionTokenHistory.findUnique({
    where: { tokenHash: session.sessionTokenHash },
    select: { id: true },
  });

  if (existingHistory) {
    return;
  }

  await transaction.userSessionTokenHistory.create({
    data: {
      organizationId: session.organizationId,
      userSessionId: session.id,
      tokenHash: session.sessionTokenHash,
      issuedAt: session.currentTokenIssuedAt,
      expiresAt: session.expiresAt,
      retiredAt,
      retirementReason: reason,
    },
  });
}

export class AuthRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async findUserForLogin(
    input: LoginIdentityInput,
  ): Promise<LoginAccount | null> {
    const user = await this.database.user.findFirst({
      where: {
        organization: { organizationCode: input.organizationCode },
        ...(input.username
          ? { username: input.username }
          : { email: input.email }),
      },
      select: {
        id: true,
        organizationId: true,
        passwordHash: true,
        status: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        organization: {
          select: {
            settings: { select: { maxConcurrentSessions: true } },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return Object.freeze({
      userId: user.id,
      organizationId: user.organizationId,
      passwordHash: user.passwordHash,
      status: user.status,
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      maxConcurrentSessions:
        user.organization.settings?.maxConcurrentSessions ?? null,
    });
  }

  async clearExpiredLock(userId: string, now: Date): Promise<void> {
    await this.database.user.updateMany({
      where: { id: userId, lockedUntil: { lte: now } },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  async recordFailedLogin(
    userId: string,
    now: Date,
    failureThreshold: number,
    lockDurationMs: number,
    audit?: AuthMutationAudit<FailedLoginResult>,
  ): Promise<FailedLoginResult> {
    return this.database.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      const user = await transaction.user.findUniqueOrThrow({
        where: { id: userId },
        select: { failedLoginAttempts: true, lockedUntil: true },
      });

      if (user.lockedUntil && user.lockedUntil > now) {
        const result = Object.freeze({
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil,
        });
        await audit?.(result, transaction);
        return result;
      }

      const failedLoginAttempts = user.failedLoginAttempts + 1;
      const lockedUntil =
        failedLoginAttempts >= failureThreshold
          ? new Date(now.getTime() + lockDurationMs)
          : null;

      await transaction.user.update({
        where: { id: userId },
        data: { failedLoginAttempts, lockedUntil },
      });
      const result = Object.freeze({ failedLoginAttempts, lockedUntil });
      await audit?.(result, transaction);
      return result;
    });
  }

  async createLoginSession(
    input: CreateLoginSessionInput,
    audit?: AuthMutationAudit<CreateLoginSessionResult>,
  ): Promise<CreateLoginSessionResult> {
    return this.database.$transaction(async (transaction) => {
      await lockUser(transaction, input.userId);
      const user = await transaction.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: {
          organizationId: true,
          status: true,
          lockedUntil: true,
          organization: {
            select: {
              settings: { select: { maxConcurrentSessions: true } },
            },
          },
        },
      });

      if (
        user.organizationId !== input.organizationId ||
        user.status !== "Active" ||
        (user.lockedUntil !== null && user.lockedUntil > input.now)
      ) {
        return { kind: "denied" } as const;
      }

      const maxConcurrentSessions =
        user.organization.settings?.maxConcurrentSessions ??
        input.defaultMaxConcurrentSessions;
      const activeSessionCount = await transaction.userSession.count({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          status: "Active",
          expiresAt: { gt: input.now },
        },
      });

      if (activeSessionCount >= maxConcurrentSessions) {
        return { kind: "limit" } as const;
      }

      await transaction.userSession.updateMany({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          status: "Active",
          expiresAt: { lte: input.now },
        },
        data: { status: "Expired" },
      });

      const session = await transaction.userSession.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          sessionTokenHash: input.tokenHash,
          currentTokenIssuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
          lastActivityAt: input.now,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          status: "Active",
        },
        select: { id: true },
      });

      await transaction.user.update({
        where: { id: input.userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: input.now,
        },
      });

      const result = { kind: "created", sessionId: session.id } as const;
      await audit?.(result, transaction);
      return result;
    });
  }

  async getSessionForAuthentication(
    sessionId: string,
  ): Promise<SessionAuthenticationRecord | null> {
    const session = await this.database.userSession.findUnique({
      where: { id: sessionId },
      select: {
        ...identitySelection,
        status: true,
        expiresAt: true,
      },
    });

    if (!session) {
      return null;
    }

    return Object.freeze({
      ...mapIdentity(session),
      sessionStatus: session.status,
      expiresAt: session.expiresAt,
      userStatus: session.user.status,
      lockedUntil: session.user.lockedUntil,
    });
  }

  async markSessionExpired(sessionId: string, now: Date): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await lockSession(transaction, sessionId);
      const session = await transaction.userSession.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.status !== "Active" || session.expiresAt > now) {
        return;
      }

      await retireCurrentToken(transaction, session, "Expired", now);
      await transaction.userSession.update({
        where: { id: sessionId },
        data: { status: "Expired" },
      });
    });
  }

  async updateSessionActivity(sessionId: string, now: Date): Promise<void> {
    await this.database.userSession.updateMany({
      where: { id: sessionId, status: "Active", expiresAt: { gt: now } },
      data: { lastActivityAt: now },
    });
  }

  async rotateRefreshSession(
    input: RotateSessionInput,
    audit?: AuthMutationAudit<RotateSessionResult>,
  ): Promise<RotateSessionResult> {
    return this.database.$transaction(async (transaction) => {
      const sessionReference = await transaction.userSession.findFirst({
        where: {
          OR: [
            { sessionTokenHash: input.presentedTokenHash },
            {
              tokenHistory: {
                some: { tokenHash: input.presentedTokenHash },
              },
            },
          ],
        },
        select: { id: true },
      });

      if (!sessionReference) {
        return { kind: "invalid" } as const;
      }

      await lockSession(transaction, sessionReference.id);
      const session = await transaction.userSession.findUniqueOrThrow({
        where: { id: sessionReference.id },
        select: {
          ...identitySelection,
          sessionTokenHash: true,
          currentTokenIssuedAt: true,
          expiresAt: true,
          status: true,
        },
      });
      const retiredToken = await transaction.userSessionTokenHistory.findUnique(
        {
          where: { tokenHash: input.presentedTokenHash },
          select: { userSessionId: true },
        },
      );

      if (
        session.sessionTokenHash !== input.presentedTokenHash &&
        retiredToken?.userSessionId === session.id
      ) {
        await retireCurrentToken(
          transaction,
          session,
          "Compromised",
          input.now,
        );
        await transaction.userSession.update({
          where: { id: session.id },
          data: {
            status: "Compromised",
            revokedAt: input.now,
            revocationReason: "RefreshTokenReuse",
          },
        });
        const result = {
          kind: "reused",
          identity: mapIdentity(session),
        } as const;
        await audit?.(result, transaction);
        return result;
      }

      if (
        session.sessionTokenHash !== input.presentedTokenHash ||
        session.status !== "Active" ||
        session.expiresAt <= input.now ||
        session.user.status !== "Active" ||
        (session.user.lockedUntil !== null &&
          session.user.lockedUntil > input.now)
      ) {
        if (session.status === "Active" && session.expiresAt <= input.now) {
          await retireCurrentToken(transaction, session, "Expired", input.now);
          await transaction.userSession.update({
            where: { id: session.id },
            data: { status: "Expired" },
          });
        }
        return { kind: "invalid" } as const;
      }

      await retireCurrentToken(transaction, session, "Rotated", input.now);
      await transaction.userSession.update({
        where: { id: session.id },
        data: {
          sessionTokenHash: input.replacementTokenHash,
          currentTokenIssuedAt: input.replacementIssuedAt,
          expiresAt: input.replacementExpiresAt,
          lastActivityAt: input.now,
        },
      });

      return {
        kind: "rotated",
        identity: mapIdentity(session),
      } as const;
    });
  }

  async logoutSession(
    sessionId: string,
    now: Date,
    audit?: AuthMutationAudit<void>,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await lockSession(transaction, sessionId);
      const session = await transaction.userSession.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.status !== "Active") {
        await audit?.(undefined, transaction);
        return;
      }

      await retireCurrentToken(transaction, session, "LoggedOut", now);
      await transaction.userSession.update({
        where: { id: sessionId },
        data: { status: "LoggedOut", logoutAt: now },
      });
      await audit?.(undefined, transaction);
    });
  }

  async getPasswordAccount(
    userId: string,
    organizationId: string,
    historyDepth: number,
  ): Promise<PasswordAccount | null> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        organizationId: true,
        passwordHash: true,
        passwordHistory: {
          orderBy: { createdAt: "desc" },
          take: historyDepth,
          select: { passwordHash: true },
        },
      },
    });

    if (!user || user.organizationId !== organizationId) {
      return null;
    }

    return Object.freeze({
      userId: user.id,
      organizationId: user.organizationId,
      passwordHash: user.passwordHash,
      historicalPasswordHashes: user.passwordHistory.map(
        (history) => history.passwordHash,
      ),
    });
  }

  async changePassword(
    input: ChangePasswordInput,
    audit?: AuthMutationAudit<boolean>,
  ): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      await lockUser(transaction, input.userId);
      const user = await transaction.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { organizationId: true, passwordHash: true },
      });

      if (
        user.organizationId !== input.organizationId ||
        user.passwordHash !== input.expectedPasswordHash
      ) {
        return false;
      }

      await transaction.userPasswordHistory.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          passwordHash: user.passwordHash,
        },
      });
      await transaction.user.update({
        where: { id: input.userId },
        data: {
          passwordHash: input.newPasswordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await this.revokeSessionsInTransaction(
        transaction,
        input.organizationId,
        input.userId,
        input.now,
        "PasswordChanged",
        input.currentSessionId,
      );

      await audit?.(true, transaction);
      return true;
    });
  }

  async createPasswordResetToken(
    input: CreatePasswordResetTokenInput,
  ): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await lockUser(transaction, input.userId);
      await transaction.passwordResetToken.updateMany({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: input.now },
      });
      await transaction.passwordResetToken.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      });
    });
  }

  async getPasswordResetAccount(
    tokenHash: string,
    now: Date,
    historyDepth: number,
  ): Promise<(PasswordAccount & { readonly resetTokenId: string }) | null> {
    const token = await this.database.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        user: {
          select: {
            passwordHash: true,
            passwordHistory: {
              orderBy: { createdAt: "desc" },
              take: historyDepth,
              select: { passwordHash: true },
            },
          },
        },
      },
    });

    if (
      !token ||
      token.usedAt !== null ||
      token.revokedAt !== null ||
      token.expiresAt <= now
    ) {
      return null;
    }

    return Object.freeze({
      resetTokenId: token.id,
      userId: token.userId,
      organizationId: token.organizationId,
      passwordHash: token.user.passwordHash,
      historicalPasswordHashes: token.user.passwordHistory.map(
        (history) => history.passwordHash,
      ),
    });
  }

  async completePasswordReset(
    input: CompletePasswordResetInput,
    audit?: AuthMutationAudit<boolean>,
  ): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      await lockUser(transaction, input.userId);
      const token = await transaction.passwordResetToken.findUnique({
        where: { id: input.resetTokenId },
      });
      const user = await transaction.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { organizationId: true, passwordHash: true },
      });

      if (
        !token ||
        token.organizationId !== input.organizationId ||
        token.userId !== input.userId ||
        token.usedAt !== null ||
        token.revokedAt !== null ||
        token.expiresAt <= input.now ||
        user.organizationId !== input.organizationId ||
        user.passwordHash !== input.expectedPasswordHash
      ) {
        return false;
      }

      await transaction.userPasswordHistory.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          passwordHash: user.passwordHash,
        },
      });
      await transaction.user.update({
        where: { id: input.userId },
        data: {
          passwordHash: input.newPasswordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      await transaction.passwordResetToken.update({
        where: { id: input.resetTokenId },
        data: { usedAt: input.now },
      });
      await transaction.passwordResetToken.updateMany({
        where: {
          organizationId: input.organizationId,
          userId: input.userId,
          id: { not: input.resetTokenId },
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: input.now },
      });
      await this.revokeSessionsInTransaction(
        transaction,
        input.organizationId,
        input.userId,
        input.now,
        "PasswordReset",
      );

      await audit?.(true, transaction);
      return true;
    });
  }

  private async revokeSessionsInTransaction(
    transaction: TransactionClient,
    organizationId: string,
    userId: string,
    now: Date,
    revocationReason: "PasswordChanged" | "PasswordReset",
    exceptSessionId?: string,
  ): Promise<void> {
    const sessions = await transaction.userSession.findMany({
      where: {
        organizationId,
        userId,
        status: "Active",
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
    });

    for (const session of sessions) {
      await retireCurrentToken(transaction, session, "Revoked", now);
    }

    await transaction.userSession.updateMany({
      where: {
        organizationId,
        userId,
        status: "Active",
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: {
        status: "Revoked",
        revokedAt: now,
        revocationReason,
      },
    });
  }
}

export const authRepository = new AuthRepository();
