import { describe, expect, it, jest } from "@jest/globals";
import type {
  KafkaConsumerTransport,
  KafkaTransportMessage,
} from "./kafka-client.js";
import { KafkaConnectionError } from "./kafka.errors.js";
import { KafkaTypedConsumer } from "./kafka-consumer.js";
import {
  createKafkaConsumerGroupId,
  createKafkaTopicName,
} from "./kafka-topic.js";

interface FoundationMessage {
  readonly kind: "kafka-foundation";
}

function createTransport(): KafkaConsumerTransport & {
  handler?: (message: KafkaTransportMessage) => Promise<void>;
} {
  const transport: KafkaConsumerTransport & {
    handler?: (message: KafkaTransportMessage) => Promise<void>;
  } = {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    subscribe: jest.fn(async () => undefined),
    run: jest.fn(
      async (handler: (message: KafkaTransportMessage) => Promise<void>) => {
        transport.handler = handler;
      },
    ),
    stop: jest.fn(async () => undefined),
  };
  return transport;
}

describe("Kafka typed consumer boundary", () => {
  it("registers, subscribes, decodes, handles, and shuts down gracefully", async () => {
    const transport = createTransport();
    const groupId = createKafkaConsumerGroupId("sunshine-foundation-test");
    const topic = createKafkaTopicName("sunshine.infrastructure.events");
    const handled: FoundationMessage[] = [];
    const consumer = new KafkaTypedConsumer(groupId, transport);

    consumer.register<FoundationMessage>({
      topic,
      decode(value) {
        const decoded: unknown = JSON.parse(value.toString("utf8"));
        if (
          typeof decoded !== "object" ||
          decoded === null ||
          !("kind" in decoded) ||
          decoded.kind !== "kafka-foundation"
        ) {
          throw new TypeError("invalid foundation message");
        }
        return { kind: decoded.kind };
      },
      async handle(message) {
        handled.push(message.value);
      },
    });

    await consumer.start();
    expect(transport.subscribe).toHaveBeenCalledWith([topic]);
    await transport.handler?.({
      topic,
      partition: 0,
      offset: "1",
      key: Buffer.from("foundation-key"),
      value: Buffer.from('{"kind":"kafka-foundation"}'),
      headers: { "x-correlation-id": ["correlation-id"] },
    });
    expect(handled).toEqual([{ kind: "kafka-foundation" }]);

    await consumer.stop();
    expect(transport.stop).toHaveBeenCalledTimes(1);
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns a typed failure when the consumer cannot connect", async () => {
    const transport = createTransport();
    transport.connect = jest.fn(async () => {
      throw new Error("unavailable");
    });
    const consumer = new KafkaTypedConsumer(
      createKafkaConsumerGroupId("sunshine-foundation-test"),
      transport,
    );
    consumer.register({
      topic: createKafkaTopicName("sunshine.infrastructure.events"),
      decode: (value) => value,
      handle: async () => undefined,
    });

    await expect(consumer.start()).rejects.toBeInstanceOf(KafkaConnectionError);
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
  });
});
