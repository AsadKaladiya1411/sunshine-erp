import { env } from "@sunshine-erp/config";
import { KafkaInfrastructureClient } from "@sunshine-erp/messaging";
import { logger } from "../../logging/logger.js";

export const kafkaClient = new KafkaInfrastructureClient(
  {
    enabled: env.KAFKA_ENABLED,
    brokers: env.KAFKA_BROKERS,
    clientId: env.KAFKA_CLIENT_ID,
  },
  undefined,
  logger,
);
