import { prisma } from "../../../core/database/prisma.js";
import { redisClient } from "../../../core/cache/redis-client.js";

export async function checkDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export function checkRedisConnection(): Promise<boolean> {
  return redisClient.ping();
}
