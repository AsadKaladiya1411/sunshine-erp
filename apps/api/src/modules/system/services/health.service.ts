import { InfrastructureUnavailableError } from "../../../core/http/errors.js";
import {
  checkDatabaseConnection,
  checkRedisConnection,
  checkStorageConnection,
} from "../repositories/health.repository.js";

export interface HealthStatus {
  status: "ok";
  database: "connected";
}

export interface RedisHealthStatus {
  status: "ok";
  redis: "connected";
}

export interface StorageHealthStatus {
  status: "ok";
  storage: "connected";
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

export async function getStorageHealthStatus(): Promise<StorageHealthStatus> {
  if (!(await checkStorageConnection())) {
    throw new InfrastructureUnavailableError(
      "STORAGE_UNAVAILABLE",
      "Object storage infrastructure is unavailable.",
    );
  }

  return {
    status: "ok",
    storage: "connected",
  };
}
