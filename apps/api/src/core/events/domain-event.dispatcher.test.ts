import { describe, expect, it, jest } from "@jest/globals";
import { DomainEventDispatcher } from "./domain-event.dispatcher.js";
import type { DomainEventHandler } from "./domain-event.handler.js";
import type { DomainEventPublisher } from "./domain-event.publisher.js";
import {
  createDomainEvent,
  defineDomainEventType,
} from "./domain-event.types.js";
import { DomainEventDispatchError } from "./event.errors.js";

interface TestPayload {
  sequence: number;
  nested: {
    labels: string[];
  };
}

const recordedEvent = defineDomainEventType<TestPayload>()(
  "foundation.test.recorded",
  1,
);
const recordedEventV2 = defineDomainEventType<TestPayload>()(
  "foundation.test.recorded",
  2,
);
const unmatchedEvent = defineDomainEventType<TestPayload>()(
  "foundation.test.unmatched",
  1,
);

function createRecordedEvent(sequence = 1) {
  return createDomainEvent(recordedEvent, {
    organizationId: "organization-1",
    aggregateType: "TestAggregate",
    aggregateId: "aggregate-1",
    actorId: "user-1",
    correlationId: "correlation-1",
    causationId: "cause-1",
    payload: {
      sequence,
      nested: {
        labels: ["created"],
      },
    },
  });
}

describe("Domain Event foundation", () => {
  it("creates an immutable typed envelope with explicit type and version", () => {
    const inputPayload: TestPayload = {
      sequence: 7,
      nested: { labels: ["original"] },
    };
    const event = createDomainEvent(recordedEvent, {
      organizationId: "organization-1",
      aggregateType: "TestAggregate",
      aggregateId: "aggregate-1",
      actorId: "user-1",
      correlationId: "correlation-1",
      causationId: "cause-1",
      payload: inputPayload,
    });

    expect(event.eventType).toBe("foundation.test.recorded");
    expect(event.eventVersion).toBe(1);
    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
    expect(event).toMatchObject({
      organizationId: "organization-1",
      aggregateType: "TestAggregate",
      aggregateId: "aggregate-1",
      actorId: "user-1",
      correlationId: "correlation-1",
      causationId: "cause-1",
      payload: {
        sequence: 7,
        nested: { labels: ["original"] },
      },
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(Object.isFrozen(event.payload.nested)).toBe(true);
    expect(Object.isFrozen(event.payload.nested.labels)).toBe(true);

    inputPayload.sequence = 8;
    inputPayload.nested.labels.push("external-mutation");
    expect(event.payload.sequence).toBe(7);
    expect(event.payload.nested.labels).toEqual(["original"]);
  });

  it("generates a unique event ID for every envelope", () => {
    const first = createRecordedEvent();
    const second = createRecordedEvent();

    expect(first.eventId).not.toBe(second.eventId);
  });

  it("enforces the event naming and version conventions", () => {
    expect(() =>
      defineDomainEventType<TestPayload>()("InvalidEventName", 1),
    ).toThrow(TypeError);
    expect(() =>
      defineDomainEventType<TestPayload>()("foundation.test.invalid", 0),
    ).toThrow(TypeError);
  });

  it("registers typed handlers and dispatches only exact type-version matches", async () => {
    const dispatcher = new DomainEventDispatcher();
    const handledSequences: number[] = [];
    const handler: DomainEventHandler<typeof recordedEvent> = {
      handle: (event) => {
        handledSequences.push(event.payload.sequence);
      },
    };
    const unregister = dispatcher.register(recordedEvent, handler);

    await dispatcher.publish(createRecordedEvent(11));
    await dispatcher.publish(
      createDomainEvent(recordedEventV2, {
        correlationId: "correlation-2",
        payload: { sequence: 12, nested: { labels: [] } },
      }),
    );
    await dispatcher.publish(
      createDomainEvent(unmatchedEvent, {
        correlationId: "correlation-3",
        payload: { sequence: 13, nested: { labels: [] } },
      }),
    );
    unregister();
    await dispatcher.publish(createRecordedEvent(14));

    expect(handledSequences).toEqual([11]);
  });

  it("dispatches an immutable event to every matching handler", async () => {
    const dispatcher = new DomainEventDispatcher();
    const firstHandler = jest.fn(() => undefined);
    const secondHandler = jest.fn(
      (event: ReturnType<typeof createRecordedEvent>) => {
        expect(Reflect.set(event, "correlationId", "changed")).toBe(false);
        expect(Reflect.set(event.payload.nested, "labels", [])).toBe(false);
      },
    );
    dispatcher.register(recordedEvent, { handle: firstHandler });
    dispatcher.register(recordedEvent, { handle: secondHandler });
    const publisher: DomainEventPublisher = dispatcher;
    const event = createRecordedEvent();

    await publisher.publish(event);

    expect(firstHandler).toHaveBeenCalledWith(event);
    expect(secondHandler).toHaveBeenCalledWith(event);
    expect(event.correlationId).toBe("correlation-1");
    expect(event.payload.nested.labels).toEqual(["created"]);
  });

  it("isolates handlers while propagating every handler failure predictably", async () => {
    const dispatcher = new DomainEventDispatcher();
    const completedHandler = jest.fn(() => undefined);
    const firstFailure = new Error("first handler failed");
    const secondFailure = new Error("second handler failed");
    dispatcher.register(recordedEvent, {
      handle: () => {
        throw firstFailure;
      },
    });
    dispatcher.register(recordedEvent, { handle: completedHandler });
    dispatcher.register(recordedEvent, {
      handle: async () => Promise.reject(secondFailure),
    });
    const event = createRecordedEvent();

    let dispatchError: unknown;
    try {
      await dispatcher.publish(event);
    } catch (error: unknown) {
      dispatchError = error;
    }

    expect(completedHandler).toHaveBeenCalledWith(event);
    expect(dispatchError).toBeInstanceOf(DomainEventDispatchError);
    expect(dispatchError).toMatchObject({
      eventId: event.eventId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
    });
    expect((dispatchError as DomainEventDispatchError).errors).toEqual([
      firstFailure,
      secondFailure,
    ]);
  });
});
