import { prisma } from "../../../core/database/prisma.js";

export async function getHealthStatus() {
  await prisma.systemCheck.findFirst();

  return {
    status: "ok",
    database: "connected",
  };
}