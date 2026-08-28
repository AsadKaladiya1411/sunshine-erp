import { PrismaClient, type Prisma } from "../../generated/prisma/client.js";
import { prisma } from "./prisma.js";

export type DatabaseTransaction = Prisma.TransactionClient;

export function runInDatabaseTransaction<TResult>(
  operation: (transaction: DatabaseTransaction) => Promise<TResult>,
  database: PrismaClient = prisma,
): Promise<TResult> {
  return database.$transaction(operation);
}
