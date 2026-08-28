import { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import { prisma } from "../database/prisma.js";
import type { DatabaseTransaction } from "../database/transaction.js";
import type { AnyDomainEvent } from "./domain-event.types.js";
import type {
  OutboxEventRecord,
  OutboxEventStatus,
  OutboxJsonValue,
} from "./outbox-event.types.js";
import {
  DuplicateOutboxEventError,
  OutboxStateTransitionError,
} from "./outbox.errors.js";
import {
  assertSafeOutboxFailure,
  serializeSafeOutboxPayload,
} from "./outbox-safety.js";

const outboxEventSelection = {
  id: true,
  eventId: true,
  eventType: true,
  eventVersion: true,
  occurredAt: true,
  organizationId: true,
  aggregateType: true,
  aggregateId: true,
  actorId: true,
  correlationId: true,
  causationId: true,
  payload: true,
  status: true,
  attempts: true,
  availableAt: true,
  publishedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OutboxEventSelect;

type OutboxDatabaseRecord = Prisma.OutboxEventGetPayload<{
  select: typeof outboxEventSelection;
}>;

function mapOutboxEvent(record: OutboxDatabaseRecord): OutboxEventRecord {
  return Object.freeze({
    ...record,
    payload: record.payload as OutboxJsonValue,
    status: record.status as OutboxEventStatus,
  });
}

function validDate(value: Date, label: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new TypeError(`${label} must be a valid date.`);
  }
  return value;
}

export class OutboxRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async append(
    transaction: DatabaseTransaction,
    event: AnyDomainEvent,
    availableAt = new Date(),
  ): Promise<OutboxEventRecord> {
    const occurredAt = validDate(new Date(event.occurredAt), "occurredAt");
    validDate(availableAt, "availableAt");
    const payload = serializeSafeOutboxPayload(event.payload);

    try {
      const record = await transaction.outboxEvent.create({
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          occurredAt,
          organizationId: event.organizationId,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          actorId: event.actorId,
          correlationId: event.correlationId,
          causationId: event.causationId,
          payload: payload as Prisma.InputJsonValue,
          availableAt,
        },
        select: outboxEventSelection,
      });
      return mapOutboxEvent(record);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new DuplicateOutboxEventError(event.eventId);
      }
      throw error;
    }
  }

  async findPending(
    limit = 100,
    now = new Date(),
  ): Promise<readonly OutboxEventRecord[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new TypeError("Outbox polling limit must be between 1 and 1000.");
    }
    validDate(now, "now");

    const records = await this.database.outboxEvent.findMany({
      where: {
        status: "Pending",
        availableAt: { lte: now },
        publishedAt: null,
      },
      orderBy: [
        { availableAt: "asc" },
        { occurredAt: "asc" },
        { createdAt: "asc" },
        { eventId: "asc" },
      ],
      take: limit,
      select: outboxEventSelection,
    });
    return Object.freeze(records.map(mapOutboxEvent));
  }

  async markPublished(
    eventId: string,
    publishedAt = new Date(),
  ): Promise<void> {
    validDate(publishedAt, "publishedAt");
    const result = await this.database.outboxEvent.updateMany({
      where: {
        eventId,
        status: "Pending",
        publishedAt: null,
      },
      data: {
        status: "Published",
        publishedAt,
        lastError: null,
      },
    });
    if (result.count !== 1) {
      throw new OutboxStateTransitionError(eventId);
    }
  }

  async recordFailure(
    eventId: string,
    lastError: string,
    availableAt: Date,
  ): Promise<void> {
    const safeLastError = assertSafeOutboxFailure(lastError);
    validDate(availableAt, "availableAt");
    const result = await this.database.outboxEvent.updateMany({
      where: {
        eventId,
        status: "Pending",
        publishedAt: null,
      },
      data: {
        attempts: { increment: 1 },
        availableAt,
        lastError: safeLastError,
      },
    });
    if (result.count !== 1) {
      throw new OutboxStateTransitionError(eventId);
    }
  }
}

export const outboxRepository = new OutboxRepository();
