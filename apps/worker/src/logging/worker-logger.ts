import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";
import { env } from "@sunshine-erp/config";

export interface WorkerLogger {
  info(bindings: Readonly<Record<string, unknown>>, message: string): void;
  warn(bindings: Readonly<Record<string, unknown>>, message: string): void;
  error(bindings: Readonly<Record<string, unknown>>, message: string): void;
  fatal(bindings: Readonly<Record<string, unknown>>, message: string): void;
}

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    application: "worker",
    environment: env.NODE_ENV,
  },
  redact: {
    paths: [
      "authorization",
      "Authorization",
      "cookie",
      "Cookie",
      "cookies",
      "password",
      "passwordHash",
      "currentPassword",
      "newPassword",
      "token",
      "accessToken",
      "refreshToken",
      "resetToken",
      "sessionToken",
      "jwt",
      "secret",
      "clientSecret",
      "apiKey",
      "DATABASE_URL",
      "REDIS_URL",
      "KAFKA_BROKERS",
      "kafkaBrokers",
      "kafkaCredentials",
      "headers.authorization",
      "headers.Authorization",
      "headers.cookie",
      "headers.Cookie",
      "payload.password",
      "payload.passwordHash",
      "payload.token",
      "payload.accessToken",
      "payload.refreshToken",
      "payload.resetToken",
      "payload.sessionToken",
      "payload.secret",
      "payload.apiKey",
    ],
    censor: "[REDACTED]",
  },
};

export function createWorkerLogger(destination?: DestinationStream): Logger {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export const workerLogger = createWorkerLogger();
