import { env, type Environment } from "@sunshine-erp/config";
import {
  KafkaInfrastructureClient,
  type KafkaClientConfiguration,
  type KafkaOperationalLogger,
} from "@sunshine-erp/messaging";
import { BackgroundHandlerRegistry } from "./handlers/background-handler.registry.js";
import {
  createWorkerLogger,
  type WorkerLogger,
} from "./logging/worker-logger.js";
import type { WorkerLifecycleComponent } from "./runtime/worker-lifecycle.js";
import type { WorkerKafkaLifecycle } from "./runtime/worker-lifecycle.js";
import { WorkerRuntime } from "./runtime/worker-runtime.js";

export type WorkerConfiguration = Pick<
  Environment,
  "NODE_ENV" | "KAFKA_ENABLED" | "KAFKA_BROKERS" | "KAFKA_CLIENT_ID"
>;

export type WorkerKafkaClientFactory = (
  configuration: KafkaClientConfiguration,
  logger: KafkaOperationalLogger,
) => WorkerKafkaLifecycle;

export interface CreateWorkerApplicationOptions {
  readonly configuration?: WorkerConfiguration;
  readonly logger?: WorkerLogger;
  readonly components?: readonly WorkerLifecycleComponent[];
  readonly kafkaClientFactory?: WorkerKafkaClientFactory;
}

export interface WorkerApplication {
  readonly handlers: BackgroundHandlerRegistry;
  readonly logger: WorkerLogger;
  readonly runtime: WorkerRuntime;
}

const defaultKafkaClientFactory: WorkerKafkaClientFactory = (
  configuration,
  logger,
) => new KafkaInfrastructureClient(configuration, undefined, logger);

export function createWorkerApplication(
  options: CreateWorkerApplicationOptions = {},
): WorkerApplication {
  const configuration = options.configuration ?? env;
  const logger = options.logger ?? createWorkerLogger();
  const kafkaClientFactory =
    options.kafkaClientFactory ?? defaultKafkaClientFactory;
  const kafka = kafkaClientFactory(
    {
      enabled: configuration.KAFKA_ENABLED,
      brokers: configuration.KAFKA_BROKERS,
      clientId: configuration.KAFKA_CLIENT_ID,
    },
    logger,
  );
  const handlers = new BackgroundHandlerRegistry();
  const runtime = new WorkerRuntime({
    kafka,
    components: [handlers, ...(options.components ?? [])],
    logger,
  });

  return Object.freeze({ handlers, logger, runtime });
}
