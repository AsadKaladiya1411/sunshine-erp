import { randomUUID } from "node:crypto";

import {
  assertDomainEventJsonSafeText,
  type JsonSafe,
  normalizeDomainEventPayload,
} from "./domain-event-payload.js";

declare const domainEventPayloadType: unique symbol;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly DeepReadonly<TItem>[]
    : T extends object
      ? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
      : T;

export interface DomainEventDefinition<
  TPayload extends object = object,
  TEventType extends string = string,
  TEventVersion extends number = number,
> {
  readonly eventType: TEventType;
  readonly eventVersion: TEventVersion;
  readonly [domainEventPayloadType]?: TPayload;
}

export interface DomainEvent<
  TPayload extends object = object,
  TEventType extends string = string,
  TEventVersion extends number = number,
> {
  readonly eventId: string;
  readonly eventType: TEventType;
  readonly eventVersion: TEventVersion;
  readonly occurredAt: string;
  readonly organizationId?: string;
  readonly aggregateType?: string;
  readonly aggregateId?: string;
  readonly actorId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: DeepReadonly<JsonSafe<TPayload>>;
}

export type AnyDomainEventDefinition = DomainEventDefinition<
  object,
  string,
  number
>;

export type AnyDomainEvent = DomainEvent<object, string, number>;

export type DomainEventFrom<TDefinition extends AnyDomainEventDefinition> =
  TDefinition extends DomainEventDefinition<
    infer TPayload,
    infer TEventType,
    infer TEventVersion
  >
    ? DomainEvent<TPayload, TEventType, TEventVersion>
    : never;

interface CommonDomainEventInput<TPayload extends object> {
  readonly organizationId?: string;
  readonly actorId?: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: JsonSafe<TPayload>;
}

type AggregateContext =
  | {
      readonly aggregateType: string;
      readonly aggregateId: string;
    }
  | {
      readonly aggregateType?: never;
      readonly aggregateId?: never;
    };

export type CreateDomainEventInput<TPayload extends object> =
  CommonDomainEventInput<TPayload> & AggregateContext;

const eventTypePattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){2,}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSTGRES_INTEGER_MAX = 2_147_483_647;
const DOMAIN_EVENT_TYPE_MAX_LENGTH = 200;
const DOMAIN_EVENT_AGGREGATE_TYPE_MAX_LENGTH = 100;
export const DOMAIN_EVENT_CORRELATION_ID_MAX_LENGTH = 255;
const DOMAIN_EVENT_CAUSATION_ID_MAX_LENGTH = 255;

function requireText(
  value: string,
  label: string,
  maximumLength?: number,
): string {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be empty.`);
  }
  assertDomainEventJsonSafeText(value, label);
  if (maximumLength !== undefined && Array.from(value).length > maximumLength) {
    throw new TypeError(
      `${label} must not exceed ${maximumLength} characters.`,
    );
  }
  return value;
}

function requireUuid(value: string, label: string): string {
  requireText(value, label);
  if (!uuidPattern.test(value)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
  return value;
}

function deepFreeze<T>(
  value: T,
  seen = new WeakSet<object>(),
): DeepReadonly<T> {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return value as DeepReadonly<T>;
  }

  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }

  return Object.freeze(value) as DeepReadonly<T>;
}

export function defineDomainEventType<TPayload extends object>() {
  return <const TEventType extends string, const TEventVersion extends number>(
    eventType: TEventType,
    eventVersion: TEventVersion,
  ): DomainEventDefinition<TPayload, TEventType, TEventVersion> => {
    if (!eventTypePattern.test(eventType)) {
      throw new TypeError(
        "Domain event types must use lower-case <domain>.<entity>.<action> naming.",
      );
    }
    requireText(eventType, "eventType", DOMAIN_EVENT_TYPE_MAX_LENGTH);
    if (
      !Number.isSafeInteger(eventVersion) ||
      eventVersion < 1 ||
      eventVersion > POSTGRES_INTEGER_MAX
    ) {
      throw new TypeError(
        `Domain event versions must be integers between 1 and ${POSTGRES_INTEGER_MAX}.`,
      );
    }

    return Object.freeze({ eventType, eventVersion });
  };
}

export function createDomainEvent<
  TPayload extends object,
  TEventType extends string,
  TEventVersion extends number,
>(
  definition: DomainEventDefinition<TPayload, TEventType, TEventVersion>,
  input: CreateDomainEventInput<TPayload>,
): DomainEvent<TPayload, TEventType, TEventVersion> {
  requireText(
    input.correlationId,
    "correlationId",
    DOMAIN_EVENT_CORRELATION_ID_MAX_LENGTH,
  );
  if (input.organizationId !== undefined) {
    requireUuid(input.organizationId, "organizationId");
  }
  if (input.actorId !== undefined) {
    requireUuid(input.actorId, "actorId");
  }
  if (input.causationId !== undefined) {
    requireText(
      input.causationId,
      "causationId",
      DOMAIN_EVENT_CAUSATION_ID_MAX_LENGTH,
    );
  }
  if (
    (input.aggregateType === undefined) !==
    (input.aggregateId === undefined)
  ) {
    throw new TypeError(
      "aggregateType and aggregateId must either both be provided or both be omitted.",
    );
  }
  if (input.aggregateType !== undefined && input.aggregateId !== undefined) {
    requireText(
      input.aggregateType,
      "aggregateType",
      DOMAIN_EVENT_AGGREGATE_TYPE_MAX_LENGTH,
    );
    requireUuid(input.aggregateId, "aggregateId");
  }

  const payload = deepFreeze(normalizeDomainEventPayload(input.payload));
  return Object.freeze({
    eventId: randomUUID(),
    eventType: definition.eventType,
    eventVersion: definition.eventVersion,
    occurredAt: new Date().toISOString(),
    organizationId: input.organizationId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    actorId: input.actorId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    payload,
  });
}
