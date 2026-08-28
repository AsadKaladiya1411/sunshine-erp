import type {
  KafkaConsumerTransport,
  KafkaTransportMessage,
} from "./kafka-client.js";
import {
  KafkaConnectionError,
  KafkaConsumerError,
  KafkaMessageInvalidError,
} from "./kafka.errors.js";
import type { KafkaConsumerGroupId, KafkaTopicName } from "./kafka-topic.js";

export interface KafkaConsumedMessage<TValue> {
  readonly topic: KafkaTopicName;
  readonly partition: number;
  readonly offset: string;
  readonly key: string | null;
  readonly headers: Readonly<Record<string, readonly string[]>>;
  readonly value: TValue;
}

export interface KafkaConsumerRegistration<TValue> {
  readonly topic: KafkaTopicName;
  readonly decode: (value: Buffer) => TValue;
  readonly handle: (message: KafkaConsumedMessage<TValue>) => Promise<void>;
}

type RegisteredHandler = (message: KafkaTransportMessage) => Promise<void>;

export class KafkaTypedConsumer {
  private readonly handlers = new Map<KafkaTopicName, RegisteredHandler>();
  private started = false;

  constructor(
    public readonly groupId: KafkaConsumerGroupId,
    private readonly transport: KafkaConsumerTransport,
  ) {}

  register<TValue>(registration: KafkaConsumerRegistration<TValue>): void {
    if (this.started) {
      throw new KafkaConsumerError();
    }
    if (this.handlers.has(registration.topic)) {
      throw new KafkaMessageInvalidError(
        "A Kafka handler is already registered for this topic.",
      );
    }

    this.handlers.set(registration.topic, async (message) => {
      if (message.value === null) {
        throw new KafkaMessageInvalidError(
          "Kafka event messages must contain a value.",
        );
      }

      let value: TValue;
      try {
        value = registration.decode(message.value);
      } catch {
        throw new KafkaMessageInvalidError(
          "Kafka event message decoding failed.",
        );
      }

      await registration.handle({
        topic: registration.topic,
        partition: message.partition,
        offset: message.offset,
        key: message.key?.toString() ?? null,
        headers: message.headers,
        value,
      });
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    if (this.handlers.size === 0) {
      throw new KafkaMessageInvalidError(
        "At least one Kafka topic handler must be registered before startup.",
      );
    }

    try {
      await this.transport.connect();
    } catch {
      await this.transport.disconnect().catch(() => undefined);
      throw new KafkaConnectionError();
    }

    try {
      await this.transport.subscribe([...this.handlers.keys()]);
      await this.transport.run(async (message) => {
        const handler = this.handlers.get(message.topic as KafkaTopicName);
        if (!handler) {
          throw new KafkaMessageInvalidError(
            "No Kafka handler is registered for the received topic.",
          );
        }
        await handler(message);
      });
      this.started = true;
    } catch (error: unknown) {
      await this.transport.disconnect().catch(() => undefined);
      if (error instanceof KafkaMessageInvalidError) {
        throw error;
      }
      throw new KafkaConsumerError();
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;
    try {
      await this.transport.stop();
      await this.transport.disconnect();
    } catch {
      throw new KafkaConsumerError();
    }
  }
}
