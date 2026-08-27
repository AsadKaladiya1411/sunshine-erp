import app from "./app.js";
import { env } from "@sunshine-erp/config";
import { redisClient } from "./core/cache/redis-client.js";
import { prisma } from "./core/database/prisma.js";
import { logger } from "./core/logging/logger.js";

async function startApiServer(): Promise<void> {
  const redisConnected = await redisClient.connect();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, redisAvailable: redisConnected },
      "API server started",
    );
  });

  let shutdownStarted = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    logger.info({ signal }, "API shutdown started");

    server.close(async (error) => {
      await Promise.allSettled([redisClient.disconnect(), prisma.$disconnect()]);
      if (error) {
        logger.error({ err: error }, "API shutdown failed");
        process.exitCode = 1;
        return;
      }
      logger.info("API shutdown completed");
    });
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void startApiServer().catch((error: unknown) => {
  logger.fatal({ err: error }, "API startup failed");
  process.exitCode = 1;
});
