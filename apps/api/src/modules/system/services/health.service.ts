import { InfrastructureUnavailableError } from "../../../core/http/errors.js";
import {
  checkDatabaseConnection,
  checkRedisConnection,
} from "../repositories/health.repository.js";

export interface HealthStatus {
  status: "ok";
  database: "connected";
}

export interface RedisHealthStatus {
  status: "ok";
  redis: "connected";
}

export async function getHealthStatus(): Promise<HealthStatus> {
  await checkDatabaseConnection();

  return {
    status: "ok",
    database: "connected",
  };
}

export async function getRedisHealthStatus(): Promise<RedisHealthStatus> {
  if (!(await checkRedisConnection())) {
    throw new InfrastructureUnavailableError(
      "REDIS_UNAVAILABLE",
      "Redis infrastructure is unavailable.",
    );
  }

  return {
    status: "ok",
    redis: "connected",
  };
}
