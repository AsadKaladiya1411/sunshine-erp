import app from "./app.js";
import { env } from "@sunshine-erp/config";
import { redisClient } from "./core/cache/redis-client.js";
import { prisma } from "./core/database/prisma.js";
import { kafkaClient } from "./core/events/kafka/kafka-client.js";
import { logger } from "./core/logging/logger.js";
import { storageClient } from "./core/storage/storage-client.js";

async function startApiServer(): Promise<void> {
  const [redisConnected, kafkaConnected, storageConnected] = await Promise.all([
    redisClient.connect(),
    kafkaClient.connect(),
    storageClient.connect(),
  ]);
  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        redisAvailable: redisConnected,
        kafkaAvailable: kafkaConnected,
        storageAvailable: storageConnected,
      },
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
      await Promise.allSettled([
        kafkaClient.disconnect(),
        redisClient.disconnect(),
        storageClient.disconnect(),
        prisma.$disconnect(),
      ]);
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
