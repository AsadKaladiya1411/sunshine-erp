import { describe, expect, it, jest } from "@jest/globals";
import type { WorkerLogger } from "./logging/worker-logger.js";
import { createWorkerApplication } from "./bootstrap.js";

function createLogger(): WorkerLogger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  };
}

describe("worker bootstrap", () => {
  it("uses centralized worker and Kafka configuration", async () => {
    const configuration = {
      NODE_ENV: "test" as const,
      KAFKA_ENABLED: true,
      KAFKA_BROKERS: ["localhost:9092"],
      KAFKA_CLIENT_ID: "sunshine-worker-test",
    };
    const logger = createLogger();
    const kafka = {
      enabled: true,
      connect: jest.fn(async () => true),
      disconnect: jest.fn(async () => Promise.resolve()),
    };
    const kafkaClientFactory = jest.fn(() => kafka);
    const application = createWorkerApplication({
      configuration,
      logger,
      kafkaClientFactory,
    });

    await expect(application.runtime.start()).resolves.toEqual({
      kafkaAvailable: true,
    });
    expect(kafkaClientFactory).toHaveBeenCalledWith(
      {
        enabled: true,
        brokers: ["localhost:9092"],
        clientId: "sunshine-worker-test",
      },
      logger,
    );
    await application.runtime.shutdown("test");
    expect(kafka.disconnect).toHaveBeenCalledTimes(1);
  });
});
