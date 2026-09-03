import { Prisma, PrismaClient } from "../../../generated/prisma/client.js";
import { prisma } from "../../../core/database/prisma.js";
import { BootstrapNotAllowedError } from "../bootstrap.errors.js";

export type BootstrapTransaction = Prisma.TransactionClient;

export interface CreateBootstrapOrganizationInput {
  readonly organizationCode: string;
  readonly organizationName: string;
}

export interface CreateBootstrapDepartmentInput {
  readonly organizationId: string;
  readonly departmentCode: string;
  readonly departmentName: string;
}

export interface CreateBootstrapAdministratorInput {
  readonly organizationId: string;
  readonly departmentId: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly username: string;
  readonly email: string;
  readonly passwordHash: string;
}

const BOOTSTRAP_ADVISORY_LOCK_NAMESPACE = 20_260_903;
const BOOTSTRAP_ADVISORY_LOCK_ID = 15;

export class BootstrapRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  runExclusive<TResult>(
    operation: (transaction: BootstrapTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_NAMESPACE}, ${BOOTSTRAP_ADVISORY_LOCK_ID})::text AS "lock"`,
      );
      await this.assertBootstrapStateIsEmpty(transaction);
      return operation(transaction);
    });
  }

  async createOrganization(
    input: CreateBootstrapOrganizationInput,
    transaction: BootstrapTransaction,
  ): Promise<{ readonly id: string }> {
    return transaction.organization.create({
      data: {
        organizationCode: input.organizationCode,
        organizationName: input.organizationName,
        status: "Active",
      },
      select: { id: true },
    });
  }

  async createDepartment(
    input: CreateBootstrapDepartmentInput,
    transaction: BootstrapTransaction,
  ): Promise<{ readonly id: string }> {
    return transaction.department.create({
      data: {
        organizationId: input.organizationId,
        departmentCode: input.departmentCode,
        departmentName: input.departmentName,
        status: "Active",
      },
      select: { id: true },
    });
  }

  async createAdministrator(
    input: CreateBootstrapAdministratorInput,
    transaction: BootstrapTransaction,
  ): Promise<{ readonly id: string }> {
    return transaction.user.create({
      data: {
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        firstName: input.firstName,
        lastName: input.lastName,
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
        status: "Active",
      },
      select: { id: true },
    });
  }

  private async assertBootstrapStateIsEmpty(
    transaction: BootstrapTransaction,
  ): Promise<void> {
    const counts = await Promise.all([
      transaction.organization.count(),
      transaction.department.count(),
      transaction.user.count(),
      transaction.financialYear.count(),
      transaction.organizationSetting.count(),
      transaction.userSession.count(),
      transaction.userPasswordHistory.count(),
      transaction.passwordResetToken.count(),
      transaction.userSessionTokenHistory.count(),
      transaction.role.count(),
      transaction.permission.count(),
      transaction.rolePermission.count(),
      transaction.roleAssignment.count(),
      transaction.activityLog.count(),
    ]);

    if (counts.some((count) => count !== 0)) {
      throw new BootstrapNotAllowedError();
    }
  }
}

export const bootstrapRepository = new BootstrapRepository();
