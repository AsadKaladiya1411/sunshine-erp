import { KafkaJS } from "@confluentinc/kafka-javascript";
import { env } from "@sunshine-erp/config";
import { logger } from "../../logging/logger.js";
import { KafkaConnectionError, KafkaDisabledError } from "./kafka.errors.js";
import type { KafkaConsumerGroupId } from "./kafka-topic.js";

const kafkaHealthTimeoutMs = 2_000;

export interface KafkaClientConfiguration {
  readonly enabled: boolean;
  readonly brokers?: readonly string[];
  readonly clientId: string;
}

export interface KafkaWireMessage {
  readonly topic: string;
  readonly key: string;
  readonly value: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface KafkaTransportMessage {
  readonly topic: string;
  readonly partition: number;
  readonly offset: string;
  readonly key: Buffer | null;
  readonly value: Buffer | null;
  readonly headers: Readonly<Record<string, readonly string[]>>;
}

export interface KafkaAdminTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<void>;
}

export interface KafkaProducerTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: KafkaWireMessage): Promise<void>;
}

export interface KafkaConsumerTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(topics: readonly string[]): Promise<void>;
  run(
    handler: (message: KafkaTransportMessage) => Promise<void>,
  ): Promise<void>;
  stop(): Promise<void>;
}

export interface KafkaTransportFactory {
  createAdmin(): KafkaAdminTransport;
  createProducer(): KafkaProducerTransport;
  createConsumer(groupId: KafkaConsumerGroupId): KafkaConsumerTransport;
}

export interface KafkaOperationalLogger {
  info(bindings: Readonly<Record<string, unknown>>, message: string): void;
  warn(bindings: Readonly<Record<string, unknown>>, message: string): void;
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
  ) {
    return String(error.code);
  }

  return "UNKNOWN";
}

function decodeHeaders(
  headers: KafkaJS.IHeaders | undefined,
): Readonly<Record<string, readonly string[]>> {
  if (!headers) {
    return Object.freeze({});
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(headers).flatMap(([name, rawValue]) => {
        if (rawValue === undefined) {
          return [];
        }
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];
        return [[name, Object.freeze(values.map((value) => value.toString()))]];
      }),
    ),
  );
}

class ConfluentKafkaAdminTransport implements KafkaAdminTransport {
  constructor(private readonly admin: KafkaJS.Admin) {}

  connect(): Promise<void> {
    return this.admin.connect();
  }

  disconnect(): Promise<void> {
    return this.admin.disconnect();
  }

  async ping(): Promise<void> {
    await this.admin.fetchTopicMetadata({ timeout: kafkaHealthTimeoutMs });
  }
}

class ConfluentKafkaProducerTransport implements KafkaProducerTransport {
  constructor(private readonly producer: KafkaJS.Producer) {}

  connect(): Promise<void> {
    return this.producer.connect();
  }

  disconnect(): Promise<void> {
    return this.producer.disconnect();
  }

  async send(message: KafkaWireMessage): Promise<void> {
    await this.producer.send({
      topic: message.topic,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: { ...message.headers },
        },
      ],
    });
  }
}

class ConfluentKafkaConsumerTransport implements KafkaConsumerTransport {
  constructor(private readonly consumer: KafkaJS.Consumer) {}

  connect(): Promise<void> {
    return this.consumer.connect();
  }

  disconnect(): Promise<void> {
    return this.consumer.disconnect();
  }

  subscribe(topics: readonly string[]): Promise<void> {
    return this.consumer.subscribe({ topics: [...topics] });
  }

  run(
    handler: (message: KafkaTransportMessage) => Promise<void>,
  ): Promise<void> {
    return this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await handler({
          topic,
          partition,
          offset: message.offset,
          key: message.key,
          value: message.value,
          headers: decodeHeaders(message.headers),
        });
      },
    });
  }

  stop(): Promise<void> {
    return this.consumer.stop();
  }
}

class ConfluentKafkaTransportFactory implements KafkaTransportFactory {
  private readonly kafka: KafkaJS.Kafka;

  constructor(configuration: KafkaClientConfiguration) {
    if (!configuration.brokers?.length) {
      throw new KafkaDisabledError();
    }

    this.kafka = new KafkaJS.Kafka({
      kafkaJS: {
        brokers: [...configuration.brokers],
        clientId: configuration.clientId,
        logLevel: KafkaJS.logLevel.NOTHING,
        retry: { retries: 0 },
      },
    });
  }

  createAdmin(): KafkaAdminTransport {
    return new ConfluentKafkaAdminTransport(
      this.kafka.admin({
        kafkaJS: {
          logLevel: KafkaJS.logLevel.NOTHING,
          retry: { retries: 0 },
        },
      }),
    );
  }

  createProducer(): KafkaProducerTransport {
    return new ConfluentKafkaProducerTransport(
      this.kafka.producer({
        kafkaJS: {
          allowAutoTopicCreation: false,
          logLevel: KafkaJS.logLevel.NOTHING,
          retry: { retries: 0 },
        },
      }),
    );
  }

  createConsumer(groupId: KafkaConsumerGroupId): KafkaConsumerTransport {
    return new ConfluentKafkaConsumerTransport(
      this.kafka.consumer({
        kafkaJS: {
          allowAutoTopicCreation: false,
          groupId,
          logLevel: KafkaJS.logLevel.NOTHING,
          retry: { retries: 0 },
        },
      }),
    );
  }
}

export class KafkaInfrastructureClient {
  private admin: KafkaAdminTransport | undefined;
  private connectedState = false;
  private factory: KafkaTransportFactory | undefined;

  constructor(
    private readonly configuration: KafkaClientConfiguration,
    factory?: KafkaTransportFactory,
    private readonly operationalLogger: KafkaOperationalLogger = logger,
  ) {
    this.factory = factory;
  }

  get enabled(): boolean {
    return this.configuration.enabled;
  }

  get connected(): boolean {
    return this.connectedState;
  }

  async connect(): Promise<boolean> {
    if (!this.enabled) {
      this.operationalLogger.info({ component: "kafka" }, "Kafka is disabled");
      return false;
    }
    if (this.connected) {
      return true;
    }

    let admin: KafkaAdminTransport | undefined;
    try {
      admin = this.transportFactory().createAdmin();
      this.admin = admin;
      await admin.connect();
      this.connectedState = true;
      this.operationalLogger.info({ component: "kafka" }, "Kafka connected");
      return true;
    } catch (error: unknown) {
      this.admin = undefined;
      this.connectedState = false;
      await admin?.disconnect().catch(() => undefined);
      this.operationalLogger.warn(
        { component: "kafka", errorCode: safeErrorCode(error) },
        "Kafka connection unavailable; continuing without messaging infrastructure",
      );
      return false;
    }
  }

  async disconnect(): Promise<void> {
    const admin = this.admin;
    this.admin = undefined;
    this.connectedState = false;
    if (!admin) {
      return;
    }

    try {
      await admin.disconnect();
      this.operationalLogger.info({ component: "kafka" }, "Kafka disconnected");
    } catch (error: unknown) {
      this.operationalLogger.warn(
        { component: "kafka", errorCode: safeErrorCode(error) },
        "Kafka disconnect failed",
      );
    }
  }

  async ping(): Promise<boolean> {
    if (!this.connected || !this.admin) {
      return false;
    }

    try {
      await this.admin.ping();
      return true;
    } catch {
      return false;
    }
  }

  createProducerTransport(): KafkaProducerTransport {
    this.requireEnabled();
    try {
      return this.transportFactory().createProducer();
    } catch {
      throw new KafkaConnectionError();
    }
  }

  createConsumerTransport(
    groupId: KafkaConsumerGroupId,
  ): KafkaConsumerTransport {
    this.requireEnabled();
    try {
      return this.transportFactory().createConsumer(groupId);
    } catch {
      throw new KafkaConnectionError();
    }
  }

  private requireEnabled(): void {
    if (!this.enabled) {
      throw new KafkaDisabledError();
    }
  }

  private transportFactory(): KafkaTransportFactory {
    this.factory ??= new ConfluentKafkaTransportFactory(this.configuration);
    return this.factory;
  }
}

export const kafkaClient = new KafkaInfrastructureClient({
  enabled: env.KAFKA_ENABLED,
  brokers: env.KAFKA_BROKERS,
  clientId: env.KAFKA_CLIENT_ID,
});
