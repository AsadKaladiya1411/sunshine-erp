import pino from "pino";
import { env } from "@sunshine-erp/config";

export const logger = pino({
  level: env.LOG_LEVEL,
});
