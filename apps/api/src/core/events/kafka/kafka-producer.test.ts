import { randomUUID } from "node:crypto";
import { describe, expect, it, jest } from "@jest/globals";
import {
  createDomainEvent,
  defineDomainEventType,
} from "../domain-event.types.js";
import type {
  KafkaProducerTransport,
  KafkaWireMessage,
} from "./kafka-client.js";
import { KafkaPublicationError } from "./kafka.errors.js";
import {
  KafkaDomainEventProducer,
  kafkaEventHeaderNames,
} from "./kafka-producer.js";
import { createKafkaTopicName } from "./kafka-topic.js";

const kafkaCompatibilityEvent = defineDomainEventType<{
  readonly probe: "kafka-foundation";
}>()("infrastructure.kafka.compatibility", 1);

function createTransport(
  send: KafkaProducerTransport["send"] = jest.fn(async () => undefined),
): KafkaProducerTransport {
  return {
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    send,
  };
}

describe("Kafka domain event producer", () => {
  it("serializes the existing event envelope and preserves topic, key, and metadata", async () => {
    const sent: KafkaWireMessage[] = [];
    const transport = createTransport(async (message) => {
      sent.push(message);
    });
    const producer = new KafkaDomainEventProducer(transport);
    const event = createDomainEvent(kafkaCompatibilityEvent, {
      organizationId: randomUUID(),
      aggregateType: "infrastructure-probe",
      aggregateId: randomUUID(),
      actorId: randomUUID(),
      correlationId: randomUUID(),
      causationId: randomUUID(),
      payload: { probe: "kafka-foundation" },
    });
    const topic = createKafkaTopicName("sunshine.infrastructure.events");

    await producer.connect();
    await producer.publish({ topic, key: event.aggregateId!, event });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      topic,
      key: event.aggregateId,
      headers: {
        [kafkaEventHeaderNames.eventId]: event.eventId,
        [kafkaEventHeaderNames.eventType]: event.eventType,
        [kafkaEventHeaderNames.eventVersion]: "1",
        [kafkaEventHeaderNames.correlationId]: event.correlationId,
        [kafkaEventHeaderNames.causationId]: event.causationId,
      },
    });
    expect(JSON.parse(sent[0]!.value)).toEqual(event);
    await producer.disconnect();
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
  });

  it("propagates unavailable publication as a typed infrastructure error", async () => {
    const transport = createTransport(
      jest.fn(async () => {
        throw new Error("broker unavailable");
      }),
    );
    const producer = new KafkaDomainEventProducer(transport);
    const event = createDomainEvent(kafkaCompatibilityEvent, {
      correlationId: randomUUID(),
      payload: { probe: "kafka-foundation" },
    });

    await producer.connect();
    await expect(
      producer.publish({
        topic: createKafkaTopicName("sunshine.infrastructure.events"),
        key: event.eventId,
        event,
      }),
    ).rejects.toBeInstanceOf(KafkaPublicationError);
  });

  it("centralizes Kafka topic and message-key validation", () => {
    expect(() => createKafkaTopicName("invalid topic")).toThrow();
    expect(() => createKafkaTopicName(".")).toThrow();
    expect(createKafkaTopicName("sunshine.infrastructure.events")).toBe(
      "sunshine.infrastructure.events",
    );
  });
});
