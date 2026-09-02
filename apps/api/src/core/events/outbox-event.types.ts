import type {
  DomainEventJsonObject,
  DomainEventJsonPrimitive,
  DomainEventJsonValue,
} from "./domain-event-payload.js";

export const OUTBOX_EVENT_STATUSES = ["Pending", "Published"] as const;

export type OutboxEventStatus = (typeof OUTBOX_EVENT_STATUSES)[number];

export type OutboxJsonPrimitive = DomainEventJsonPrimitive;
export type OutboxJsonValue = DomainEventJsonValue;
export type OutboxJsonObject = DomainEventJsonObject;

export interface OutboxEventRecord {
  readonly id: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly occurredAt: Date;
  readonly organizationId: string | null;
  readonly aggregateType: string | null;
  readonly aggregateId: string | null;
  readonly actorId: string | null;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly payload: OutboxJsonValue;
  readonly status: OutboxEventStatus;
  readonly attempts: number;
  readonly availableAt: Date;
  readonly publishedAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
