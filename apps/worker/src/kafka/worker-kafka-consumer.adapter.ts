import type {
  KafkaConsumerRegistration,
  KafkaTypedConsumer,
} from "@sunshine-erp/messaging";
import type { WorkerLifecycleComponent } from "../runtime/worker-lifecycle.js";

type TypedConsumerBoundary = Pick<
  KafkaTypedConsumer,
  "register" | "start" | "stop"
>;

export class WorkerKafkaConsumerAdapter implements WorkerLifecycleComponent {
  readonly name: string;

  constructor(
    name: string,
    private readonly consumer: TypedConsumerBoundary,
  ) {
    this.name = `kafka-consumer:${name}`;
  }

  register<TValue>(registration: KafkaConsumerRegistration<TValue>): void {
    this.consumer.register(registration);
  }

  start(): Promise<void> {
    return this.consumer.start();
  }

  stop(): Promise<void> {
    return this.consumer.stop();
  }
}
