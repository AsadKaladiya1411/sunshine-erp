import { checkDatabaseConnection } from "../repositories/health.repository.js";

export interface HealthStatus {
  status: "ok";
  database: "connected";
}

export async function getHealthStatus(): Promise<HealthStatus> {
  await checkDatabaseConnection();

  return {
    status: "ok",
    database: "connected",
  };
}
