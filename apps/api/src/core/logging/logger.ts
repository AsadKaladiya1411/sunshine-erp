import pino, {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from "pino";
import { env } from "@sunshine-erp/config";
import { getRequestContext } from "../http/request-context.js";

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "authorization",
      "Authorization",
      "cookie",
      "Cookie",
      "cookies",
      "password",
      "currentPassword",
      "newPassword",
      "token",
      "accessToken",
      "refreshToken",
      "sessionToken",
      "secret",
      "clientSecret",
      "privateKey",
      "apiKey",
      "DATABASE_URL",
      "REDIS_URL",
      "KAFKA_BROKERS",
      "kafkaBrokers",
      "kafkaCredentials",
      "STORAGE_ACCESS_KEY",
      "STORAGE_SECRET_KEY",
      "headers.authorization",
      "headers.Authorization",
      "headers.cookie",
      "headers.Cookie",
      "body.password",
      "body.currentPassword",
      "body.newPassword",
      "body.token",
      "body.accessToken",
      "body.refreshToken",
      "body.sessionToken",
      "body.secret",
      "body.clientSecret",
      "body.privateKey",
      "body.apiKey",
      "req.headers.authorization",
      "req.headers.Authorization",
      "req.headers.cookie",
      "req.headers.Cookie",
      "req.cookies",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "req.body.token",
      "req.body.accessToken",
      "req.body.refreshToken",
      "req.body.sessionToken",
      "req.body.secret",
      "req.body.clientSecret",
      "req.body.privateKey",
      "req.body.apiKey",
      "request.headers.authorization",
      "request.headers.Authorization",
      "request.headers.cookie",
      "request.headers.Cookie",
      "request.cookies",
      "request.body.password",
      "request.body.currentPassword",
      "request.body.newPassword",
      "request.body.token",
      "request.body.accessToken",
      "request.body.refreshToken",
      "request.body.sessionToken",
      "request.body.secret",
      "request.body.clientSecret",
      "request.body.privateKey",
      "request.body.apiKey",
    ],
    censor: "[REDACTED]",
  },
  mixin() {
    const requestContext = getRequestContext();

    return requestContext
      ? { correlationId: requestContext.correlationId }
      : {};
  },
};

export function createLogger(destination?: DestinationStream): Logger {
  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export const logger = createLogger();
