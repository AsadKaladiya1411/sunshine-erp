import { Buffer } from "node:buffer";

import { describe, expect, it } from "@jest/globals";

import {
  DOMAIN_EVENT_PAYLOAD_MAX_BYTES,
  InvalidDomainEventPayloadError,
} from "./domain-event-payload.js";
import {
  createDomainEvent,
  defineDomainEventType,
  DOMAIN_EVENT_CORRELATION_ID_MAX_LENGTH,
} from "./domain-event.types.js";

interface JsonPayload {
  name: string;
  enabled: boolean;
  count: number;
  optional: null;
  nested: {
    labels: string[];
    entries: Array<{ code: string; values: number[] }>;
  };
}

const jsonEvent = defineDomainEventType<JsonPayload>()(
  "foundation.event.json-safe",
  1,
);
const stringEvent = defineDomainEventType<{ value: string }>()(
  "foundation.event.string-boundary",
  1,
);

function createJsonEvent(payload: JsonPayload) {
  return createDomainEvent(jsonEvent, {
    correlationId: "h13-correlation",
    payload,
  });
}

describe("Domain Event persistence contract", () => {
  it("accepts and preserves JSON-safe nested objects and arrays", () => {
    const payload: JsonPayload = {
      name: "foundation",
      enabled: true,
      count: 7,
      optional: null,
      nested: {
        labels: ["domain", "outbox"],
        entries: [{ code: "A", values: [1, 2, 3] }],
      },
    };

    const event = createJsonEvent(payload);

    expect(event.payload).toEqual(payload);
    expect(JSON.parse(JSON.stringify(event.payload))).toEqual(event.payload);
  });

  it.each([
    ["Date", new Date("2026-01-01T00:00:00.000Z")],
    ["BigInt", BigInt(1)],
    ["undefined", undefined],
    ["function", () => undefined],
    ["symbol", Symbol("unsupported")],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["Map", new Map([["key", "value"]])],
    ["null-character string", "\u0000"],
    ["unpaired-surrogate string", "\ud800"],
    ["sparse array", Array(1)],
  ])("rejects the non-JSON-safe %s value", (_name, value) => {
    expect(() =>
      createDomainEvent(stringEvent, {
        correlationId: "h13-invalid-value",
        payload: { value } as unknown as { value: string },
      }),
    ).toThrow(InvalidDomainEventPayloadError);
  });

  it("rejects cyclic payloads", () => {
    const payload: { self?: unknown } = {};
    payload.self = payload;

    expect(() =>
      createDomainEvent(stringEvent, {
        correlationId: "h13-cyclic-value",
        payload: payload as unknown as { value: string },
      }),
    ).toThrow("Circular values are not allowed");
  });

  it("accepts a payload exactly at the UTF-8 byte limit", () => {
    const envelopeBytes = Buffer.byteLength(
      JSON.stringify({ value: "" }),
      "utf8",
    );
    const value = "a".repeat(DOMAIN_EVENT_PAYLOAD_MAX_BYTES - envelopeBytes);

    const event = createDomainEvent(stringEvent, {
      correlationId: "h13-payload-boundary",
      payload: { value },
    });

    expect(Buffer.byteLength(JSON.stringify(event.payload), "utf8")).toBe(
      DOMAIN_EVENT_PAYLOAD_MAX_BYTES,
    );
  });

  it("rejects a payload exceeding the UTF-8 byte limit", () => {
    const envelopeBytes = Buffer.byteLength(
      JSON.stringify({ value: "" }),
      "utf8",
    );
    const value = "a".repeat(
      DOMAIN_EVENT_PAYLOAD_MAX_BYTES - envelopeBytes + 1,
    );

    expect(() =>
      createDomainEvent(stringEvent, {
        correlationId: "h13-payload-oversized",
        payload: { value },
      }),
    ).toThrow(
      `Domain event payloads must not exceed ${DOMAIN_EVENT_PAYLOAD_MAX_BYTES} UTF-8 bytes.`,
    );
  });

  it("accepts a correlation ID at the persistence boundary", () => {
    const correlationId = "c".repeat(DOMAIN_EVENT_CORRELATION_ID_MAX_LENGTH);

    expect(
      createDomainEvent(stringEvent, {
        correlationId,
        payload: { value: "valid" },
      }).correlationId,
    ).toBe(correlationId);
  });

  it("rejects a correlation ID exceeding the persistence boundary", () => {
    expect(() =>
      createDomainEvent(stringEvent, {
        correlationId: "c".repeat(DOMAIN_EVENT_CORRELATION_ID_MAX_LENGTH + 1),
        payload: { value: "valid" },
      }),
    ).toThrow(
      `correlationId must not exceed ${DOMAIN_EVENT_CORRELATION_ID_MAX_LENGTH} characters.`,
    );
  });

  it.each([
    [
      "organization UUID",
      () =>
        createDomainEvent(stringEvent, {
          organizationId: "not-a-uuid",
          correlationId: "h13-invalid-organization",
          payload: { value: "valid" },
        }),
    ],
    [
      "aggregate UUID",
      () =>
        createDomainEvent(stringEvent, {
          aggregateType: "FoundationRecord",
          aggregateId: "not-a-uuid",
          correlationId: "h13-invalid-aggregate",
          payload: { value: "valid" },
        }),
    ],
    [
      "actor UUID",
      () =>
        createDomainEvent(stringEvent, {
          actorId: "not-a-uuid",
          correlationId: "h13-invalid-actor",
          payload: { value: "valid" },
        }),
    ],
    [
      "aggregate type length",
      () =>
        createDomainEvent(stringEvent, {
          aggregateType: "a".repeat(101),
          aggregateId: "00000000-0000-4000-8000-000000000001",
          correlationId: "h13-invalid-aggregate-type",
          payload: { value: "valid" },
        }),
    ],
    [
      "causation ID length",
      () =>
        createDomainEvent(stringEvent, {
          causationId: "c".repeat(256),
          correlationId: "h13-invalid-causation",
          payload: { value: "valid" },
        }),
    ],
  ])("rejects an outbox-incompatible %s", (_name, createEvent) => {
    expect(createEvent).toThrow(TypeError);
  });

  it("rejects event definitions exceeding outbox integer and text limits", () => {
    expect(() =>
      defineDomainEventType<{ value: string }>()(
        `foundation.event.${"a".repeat(190)}`,
        1,
      ),
    ).toThrow("eventType must not exceed 200 characters");
    expect(() =>
      defineDomainEventType<{ value: string }>()(
        "foundation.event.version-boundary",
        2_147_483_648,
      ),
    ).toThrow(TypeError);
  });
});
