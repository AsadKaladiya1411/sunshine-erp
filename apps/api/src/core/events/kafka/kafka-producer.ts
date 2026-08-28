import type { AnyDomainEvent } from "../domain-event.types.js";
import {
  KafkaConnectionError,
  KafkaDisconnectionError,
  KafkaMessageInvalidError,
  KafkaPublicationError,
  createKafkaMessageKey,
  type KafkaProducerTransport,
  type KafkaTopicName,
  type KafkaWireMessage,
} from "@sunshine-erp/messaging";

export const kafkaEventHeaderNames = Object.freeze({
  eventId: "event-id",
  eventType: "event-type",
  eventVersion: "event-version",
  correlationId: "x-correlation-id",
  causationId: "causation-id",
});

export interface PublishDomainEventInput {
  readonly topic: KafkaTopicName;
  readonly key: string;
  readonly event: AnyDomainEvent;
}

export function serializeDomainEvent(
  input: PublishDomainEventInput,
): KafkaWireMessage {
  const key = createKafkaMessageKey(input.key);
  let value: string;

  try {
    value = JSON.stringify(input.event);
  } catch {
    throw new KafkaMessageInvalidError(
      "The domain event envelope cannot be serialized for Kafka.",
    );
  }

  const headers: Record<string, string> = {
    [kafkaEventHeaderNames.eventId]: input.event.eventId,
    [kafkaEventHeaderNames.eventType]: input.event.eventType,
    [kafkaEventHeaderNames.eventVersion]: String(input.event.eventVersion),
    [kafkaEventHeaderNames.correlationId]: input.event.correlationId,
  };
  if (input.event.causationId !== undefined) {
    headers[kafkaEventHeaderNames.causationId] = input.event.causationId;
  }

  return Object.freeze({
    topic: input.topic,
    key,
    value,
    headers: Object.freeze(headers),
  });
}

export class KafkaDomainEventProducer {
  private connected = false;

  constructor(private readonly transport: KafkaProducerTransport) {}

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.transport.connect();
      this.connected = true;
    } catch {
      await this.transport.disconnect().catch(() => undefined);
      throw new KafkaConnectionError();
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    try {
      await this.transport.disconnect();
    } catch {
      throw new KafkaDisconnectionError();
    }
  }

  async publish(input: PublishDomainEventInput): Promise<void> {
    if (!this.connected) {
      throw new KafkaConnectionError();
    }

    const message = serializeDomainEvent(input);
    try {
      await this.transport.send(message);
    } catch {
      throw new KafkaPublicationError();
    }
  }
}
