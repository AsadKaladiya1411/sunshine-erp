import { Buffer } from "node:buffer";

export const DOMAIN_EVENT_PAYLOAD_MAX_BYTES = 1_048_576;

export type DomainEventJsonPrimitive = string | number | boolean | null;

export type DomainEventJsonValue =
  | DomainEventJsonPrimitive
  | DomainEventJsonObject
  | readonly DomainEventJsonValue[];

export interface DomainEventJsonObject {
  readonly [key: string]: DomainEventJsonValue;
}

export type JsonSafe<T> = T extends DomainEventJsonPrimitive
  ? T
  : T extends (...args: never[]) => unknown
    ? never
    : T extends readonly (infer TItem)[]
      ? readonly JsonSafe<TItem>[]
      : T extends object
        ? { readonly [TKey in keyof T]: JsonSafe<T[TKey]> }
        : never;

export class InvalidDomainEventPayloadError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDomainEventPayloadError";
  }
}

const sensitiveKeys = new Set([
  "password",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
  "resettoken",
  "sessiontoken",
  "sessiontokenhash",
  "token",
  "authorization",
  "authorizationheader",
  "cookie",
  "apikey",
  "clientsecret",
  "secret",
  "secrets",
]);

const credentialAssignmentPattern =
  /\b(?:password(?:_hash)?|access[_ -]?token|refresh[_ -]?token|reset[_ -]?token|session[_ -]?token|authorization|cookie|api[_ -]?key|client[_ -]?secret|secret)\s*[:=]/i;
const bearerPattern = /\bBearer\s+\S+/i;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const bcryptPattern = /^\$2[aby]\$\d{2}\$/;

function fail(message: string): never {
  throw new InvalidDomainEventPayloadError(message);
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

export function assertDomainEventJsonSafeText(
  value: string,
  location: string,
): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0) {
      fail(`Null characters are not allowed in ${location}.`);
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        fail(`Invalid Unicode is not allowed in ${location}.`);
      }
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail(`Invalid Unicode is not allowed in ${location}.`);
    }
  }
}

export function assertDomainEventCredentialSafeText(
  value: string,
  location: string,
): void {
  assertDomainEventJsonSafeText(value, location);
  if (
    credentialAssignmentPattern.test(value) ||
    bearerPattern.test(value) ||
    jwtPattern.test(value) ||
    bcryptPattern.test(value)
  ) {
    fail(`Credential-shaped data is not allowed in ${location}.`);
  }
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) {
    return true;
  }
  const constructor = Reflect.get(prototype, "constructor") as unknown;
  return typeof constructor === "function" && constructor.name === "Object";
}

function assertJsonAndCredentialSafe(
  value: unknown,
  location: string,
  ancestors: WeakSet<object>,
): void {
  if (value === null || typeof value === "boolean") {
    return;
  }
  if (typeof value === "string") {
    assertDomainEventCredentialSafeText(value, location);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(`Non-finite numbers are not allowed in ${location}.`);
    }
    return;
  }
  if (typeof value !== "object") {
    fail(`Only JSON-compatible values are allowed in ${location}.`);
  }
  if (ancestors.has(value)) {
    fail(`Circular values are not allowed in ${location}.`);
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        fail(`Sparse arrays are not allowed in ${location}.`);
      }
      assertJsonAndCredentialSafe(
        value[index],
        `${location}[${index}]`,
        ancestors,
      );
    }
    ancestors.delete(value);
    return;
  }

  if (!isPlainObject(value)) {
    fail(`Only plain JSON objects are allowed in ${location}.`);
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      fail(`Symbol keys are not allowed in ${location}.`);
    }
    assertDomainEventJsonSafeText(key, `${location} key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      fail(`Only enumerable data properties are allowed in ${location}.`);
    }
    if (sensitiveKeys.has(normalizedKey(key))) {
      fail(
        `Credential field ${location}.${key} is not allowed in event payloads.`,
      );
    }
    assertJsonAndCredentialSafe(
      descriptor.value,
      `${location}.${key}`,
      ancestors,
    );
  }
  ancestors.delete(value);
}

export function normalizeDomainEventPayload<TPayload extends object>(
  payload: JsonSafe<TPayload>,
): JsonSafe<TPayload> {
  try {
    assertJsonAndCredentialSafe(payload, "payload", new WeakSet());
    const serialized = JSON.stringify(payload);
    const payloadBytes = Buffer.byteLength(serialized, "utf8");
    if (payloadBytes > DOMAIN_EVENT_PAYLOAD_MAX_BYTES) {
      fail(
        `Domain event payloads must not exceed ${DOMAIN_EVENT_PAYLOAD_MAX_BYTES} UTF-8 bytes.`,
      );
    }
    return JSON.parse(serialized) as JsonSafe<TPayload>;
  } catch (error: unknown) {
    if (error instanceof InvalidDomainEventPayloadError) {
      throw error;
    }
    throw new InvalidDomainEventPayloadError(
      "The domain event payload is not safely JSON-serializable.",
    );
  }
}
