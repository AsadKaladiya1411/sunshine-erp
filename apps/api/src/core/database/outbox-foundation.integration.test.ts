import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Client } from "pg";

import { PrismaClient } from "../../generated/prisma/client.js";
import { runInDatabaseTransaction } from "./transaction.js";
import {
  createDomainEvent,
  defineDomainEventType,
} from "../events/domain-event.types.js";
import { createOutboxDomainEventPublisher } from "../events/outbox-domain-event.publisher.js";
import { OutboxRepository } from "../events/outbox.repository.js";
import {
  DuplicateOutboxEventError,
  OutboxStateTransitionError,
  UnsafeOutboxDataError,
} from "../events/outbox.errors.js";

const migrationPaths = [
  "../../../../../prisma/migrations/20260825150000_common_administration_foundation/migration.sql",
  "../../../../../prisma/migrations/20260825220000_authentication_foundation/migration.sql",
  "../../../../../prisma/migrations/20260827052012_rbac_authorization/migration.sql",
  "../../../../../prisma/migrations/20260827090000_rbac_source_compliance/migration.sql",
  "../../../../../prisma/migrations/20260827120000_activity_logs/migration.sql",
  "../../../../../prisma/migrations/20260828045909_transactional_outbox_foundation/migration.sql",
].map((migrationPath) =>
  fileURLToPath(new URL(migrationPath, import.meta.url)),
);

interface FoundationPayload {
  sequence: number;
  details: {
    labels: string[];
  };
}

const foundationEvent = defineDomainEventType<FoundationPayload>()(
  "foundation.outbox.recorded",
  1,
);

const schemaName = `outbox_test_${randomUUID().replaceAll("-", "")}`;
const quotedSchemaName = `"${schemaName}"`;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database integration tests.");
}

function createFoundationEvent(sequence = 1) {
  return createDomainEvent(foundationEvent, {
    organizationId: randomUUID(),
    aggregateType: "FoundationRecord",
    aggregateId: randomUUID(),
    actorId: randomUUID(),
    correlationId: `correlation-${sequence}`,
    causationId: `causation-${sequence}`,
    payload: {
      sequence,
      details: { labels: ["outbox", "foundation"] },
    },
  });
}

jest.setTimeout(90_000);

describe("Transactional Outbox foundation", () => {
  let adminClient: Client;
  let sqlClient: Client;
  let database: PrismaClient;
  let repository: OutboxRepository;

  beforeAll(async () => {
    adminClient = new Client({ connectionString: databaseUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE SCHEMA ${quotedSchemaName}`);
    await adminClient.query(`SET search_path TO ${quotedSchemaName}`);
    for (const migrationPath of migrationPaths) {
      await adminClient.query(await readFile(migrationPath, "utf8"));
    }
    await adminClient.query("RESET search_path");

    sqlClient = new Client({
      connectionString: databaseUrl,
      options: `-c search_path=${schemaName}`,
    });
    await sqlClient.connect();
    database = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: databaseUrl },
        { schema: schemaName },
      ),
    });
    repository = new OutboxRepository(database);
  });

  beforeEach(async () => {
    await database.outboxEvent.deleteMany();
    await database.country.deleteMany();
  });

  afterAll(async () => {
    await database?.$disconnect();
    await sqlClient?.end();
    if (adminClient) {
      await adminClient.query(
        `DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`,
      );
      await adminClient.end();
    }
  });

  it("creates exactly the required columns, types, constraints, and polling indexes", async () => {
    const columns = await sqlClient.query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'outbox_events'
       ORDER BY ordinal_position`,
      [schemaName],
    );
    expect(columns.rows).toEqual([
      { column_name: "id", data_type: "uuid", is_nullable: "NO" },
      { column_name: "event_id", data_type: "uuid", is_nullable: "NO" },
      {
        column_name: "event_type",
        data_type: "character varying",
        is_nullable: "NO",
      },
      { column_name: "event_version", data_type: "integer", is_nullable: "NO" },
      {
        column_name: "occurred_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
      },
      { column_name: "organization_id", data_type: "uuid", is_nullable: "YES" },
      {
        column_name: "aggregate_type",
        data_type: "character varying",
        is_nullable: "YES",
      },
      { column_name: "aggregate_id", data_type: "uuid", is_nullable: "YES" },
      { column_name: "actor_id", data_type: "uuid", is_nullable: "YES" },
      {
        column_name: "correlation_id",
        data_type: "character varying",
        is_nullable: "NO",
      },
      {
        column_name: "causation_id",
        data_type: "character varying",
        is_nullable: "YES",
      },
      { column_name: "payload", data_type: "jsonb", is_nullable: "NO" },
      {
        column_name: "status",
        data_type: "character varying",
        is_nullable: "NO",
      },
      { column_name: "attempts", data_type: "integer", is_nullable: "NO" },
      {
        column_name: "available_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
      },
      {
        column_name: "published_at",
        data_type: "timestamp with time zone",
        is_nullable: "YES",
      },
      { column_name: "last_error", data_type: "text", is_nullable: "YES" },
      {
        column_name: "created_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
      },
      {
        column_name: "updated_at",
        data_type: "timestamp with time zone",
        is_nullable: "NO",
      },
    ]);

    const constraints = await sqlClient.query<{
      conname: string;
      definition: string;
    }>(
      `SELECT constraint_name AS conname,
              pg_get_constraintdef(pc.oid) AS definition
       FROM information_schema.table_constraints tc
       JOIN pg_constraint pc ON pc.conname = tc.constraint_name
       WHERE tc.table_schema = $1 AND tc.table_name = 'outbox_events'
       ORDER BY constraint_name`,
      [schemaName],
    );
    expect(constraints.rows.map(({ conname }) => conname)).toEqual(
      expect.arrayContaining([
        "outbox_events_pkey",
        "outbox_events_event_version_check",
        "outbox_events_attempts_check",
        "outbox_events_status_check",
        "outbox_events_aggregate_identity_check",
        "outbox_events_publication_state_check",
      ]),
    );

    const indexes = await sqlClient.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = $1 AND tablename = 'outbox_events'
       ORDER BY indexname`,
      [schemaName],
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "outbox_events_pkey",
        "outbox_events_event_id_key",
        "outbox_events_pending_poll_idx",
        "outbox_events_organization_id_occurred_at_idx",
        "outbox_events_aggregate_type_aggregate_id_occurred_at_idx",
        "outbox_events_correlation_id_idx",
      ]),
    );
  });

  it("preserves the domain event envelope and returns pending events in safe order", async () => {
    const first = createFoundationEvent(1);
    const second = createFoundationEvent(2);
    const future = createFoundationEvent(3);
    const firstAvailableAt = new Date("2030-01-01T00:00:00.000Z");
    const secondAvailableAt = new Date("2030-01-01T00:01:00.000Z");
    const futureAvailableAt = new Date("2031-01-01T00:00:00.000Z");

    const stored = await database.$transaction((transaction) =>
      repository.append(transaction, first, firstAvailableAt),
    );
    await database.$transaction((transaction) =>
      repository.append(transaction, second, secondAvailableAt),
    );
    await database.$transaction((transaction) =>
      repository.append(transaction, future, futureAvailableAt),
    );

    expect(stored).toMatchObject({
      eventId: first.eventId,
      eventType: first.eventType,
      eventVersion: first.eventVersion,
      organizationId: first.organizationId,
      aggregateType: first.aggregateType,
      aggregateId: first.aggregateId,
      actorId: first.actorId,
      correlationId: first.correlationId,
      causationId: first.causationId,
      payload: first.payload,
      status: "Pending",
      attempts: 0,
      publishedAt: null,
      lastError: null,
    });
    expect(stored.occurredAt.toISOString()).toBe(first.occurredAt);

    const pending = await repository.findPending(
      10,
      new Date("2030-12-31T23:59:59.000Z"),
    );
    expect(pending.map(({ eventId }) => eventId)).toEqual([
      first.eventId,
      second.eventId,
    ]);
  });

  it("prevents duplicate outbox records for a stable event ID", async () => {
    const event = createFoundationEvent();
    await database.$transaction((transaction) =>
      repository.append(transaction, event),
    );

    await expect(
      database.$transaction((transaction) =>
        repository.append(transaction, event),
      ),
    ).rejects.toBeInstanceOf(DuplicateOutboxEventError);
    await expect(
      database.outboxEvent.count({ where: { eventId: event.eventId } }),
    ).resolves.toBe(1);
  });

  it("records retry metadata and permits only Pending to Published transitions", async () => {
    const event = createFoundationEvent();
    await database.$transaction((transaction) =>
      repository.append(transaction, event),
    );
    const availableAt = new Date("2030-02-01T00:00:00.000Z");
    await repository.recordFailure(
      event.eventId,
      "Broker temporarily unavailable.",
      availableAt,
    );
    await expect(
      database.outboxEvent.findUniqueOrThrow({
        where: { eventId: event.eventId },
      }),
    ).resolves.toMatchObject({
      status: "Pending",
      attempts: 1,
      availableAt,
      lastError: "Broker temporarily unavailable.",
      publishedAt: null,
    });

    const publishedAt = new Date("2030-02-01T00:01:00.000Z");
    await repository.markPublished(event.eventId, publishedAt);
    await expect(
      database.outboxEvent.findUniqueOrThrow({
        where: { eventId: event.eventId },
      }),
    ).resolves.toMatchObject({
      status: "Published",
      attempts: 1,
      publishedAt,
      lastError: null,
    });
    await expect(
      repository.markPublished(event.eventId),
    ).rejects.toBeInstanceOf(OutboxStateTransitionError);
    await expect(
      repository.recordFailure(event.eventId, "Late failure.", new Date()),
    ).rejects.toBeInstanceOf(OutboxStateTransitionError);
    await expect(repository.findPending()).resolves.toEqual([]);
  });

  it("commits the persisted record and outbox event atomically", async () => {
    const event = createFoundationEvent();
    await runInDatabaseTransaction(async (transaction) => {
      await transaction.country.create({
        data: {
          code: "OUTBOX-COMMIT",
          name: "Outbox Commit",
          status: "Active",
        },
      });
      await createOutboxDomainEventPublisher(transaction).publish(event);
    }, database);

    await expect(
      database.country.count({ where: { code: "OUTBOX-COMMIT" } }),
    ).resolves.toBe(1);
    await expect(
      database.outboxEvent.count({ where: { eventId: event.eventId } }),
    ).resolves.toBe(1);
  });

  it("rolls back both the persisted record and outbox event on failure", async () => {
    const event = createFoundationEvent();
    await expect(
      runInDatabaseTransaction(async (transaction) => {
        await transaction.country.create({
          data: {
            code: "OUTBOX-ROLLBACK",
            name: "Outbox Rollback",
            status: "Active",
          },
        });
        await createOutboxDomainEventPublisher(transaction).publish(event);
        throw new Error("Force transaction rollback.");
      }, database),
    ).rejects.toThrow("Force transaction rollback.");

    await expect(
      database.country.count({ where: { code: "OUTBOX-ROLLBACK" } }),
    ).resolves.toBe(0);
    await expect(
      database.outboxEvent.count({ where: { eventId: event.eventId } }),
    ).resolves.toBe(0);
  });

  it("rejects credential-shaped payloads and failure metadata", async () => {
    const unsafeDefinition = defineDomainEventType<{
      password: string;
    }>()("foundation.outbox.unsafe", 1);
    const unsafeEvent = createDomainEvent(unsafeDefinition, {
      correlationId: "unsafe-correlation",
      payload: { password: "must-never-be-persisted" },
    });

    await expect(
      database.$transaction((transaction) =>
        repository.append(transaction, unsafeEvent),
      ),
    ).rejects.toBeInstanceOf(UnsafeOutboxDataError);
    await expect(database.outboxEvent.count()).resolves.toBe(0);

    const safeEvent = createFoundationEvent();
    await database.$transaction((transaction) =>
      repository.append(transaction, safeEvent),
    );
    await expect(
      repository.recordFailure(
        safeEvent.eventId,
        "Authorization: Bearer credential",
        new Date(),
      ),
    ).rejects.toBeInstanceOf(UnsafeOutboxDataError);
    await expect(
      database.outboxEvent.findUniqueOrThrow({
        where: { eventId: safeEvent.eventId },
      }),
    ).resolves.toMatchObject({ attempts: 0, lastError: null });
  });
});
