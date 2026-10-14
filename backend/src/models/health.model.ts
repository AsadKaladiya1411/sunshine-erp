export interface HealthStatus {
  readonly status: "ok";
  readonly service: "truck-hisab-backend";
}

export function getHealthStatus(): HealthStatus {
  return {
    status: "ok",
    service: "truck-hisab-backend",
  };
}

