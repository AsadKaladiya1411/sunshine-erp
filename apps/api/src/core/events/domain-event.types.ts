import { randomUUID } from "node:crypto";

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
  readonly payload: DeepReadonly<TPayload>;
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
  readonly payload: TPayload;
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

function requireNonEmpty(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be empty.`);
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
    if (!Number.isSafeInteger(eventVersion) || eventVersion < 1) {
      throw new TypeError("Domain event versions must be positive integers.");
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
  requireNonEmpty(input.correlationId, "correlationId");
  if (input.organizationId !== undefined) {
    requireNonEmpty(input.organizationId, "organizationId");
  }
  if (input.actorId !== undefined) {
    requireNonEmpty(input.actorId, "actorId");
  }
  if (input.causationId !== undefined) {
    requireNonEmpty(input.causationId, "causationId");
  }
  if (input.aggregateType !== undefined) {
    requireNonEmpty(input.aggregateType, "aggregateType");
    requireNonEmpty(input.aggregateId, "aggregateId");
  }

  const payload = deepFreeze(structuredClone(input.payload));
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
