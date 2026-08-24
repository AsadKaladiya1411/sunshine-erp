import { prisma } from "../../../core/database/prisma.js";

export async function getHealthStatus() {
  await prisma.$queryRaw`SELECT 1`;

  return {
    status: "ok",
    database: "connected",
  };
}
