import type { PrismaClient } from "../../../generated/prisma/client.js";

export type AuthorizationTransactionDatabase = Pick<PrismaClient, "activityLog">;

export type AuthorizationMutationHook<TResult> = (
  result: TResult,
  database: AuthorizationTransactionDatabase,
) => Promise<void>;
