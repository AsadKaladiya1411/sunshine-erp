import type { OutboxJsonValue } from "./outbox-event.types.js";
import { UnsafeOutboxDataError } from "./outbox.errors.js";

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

function normalizedKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function assertSafeText(value: string, location: string): void {
  if (
    credentialAssignmentPattern.test(value) ||
    bearerPattern.test(value) ||
    jwtPattern.test(value) ||
    bcryptPattern.test(value)
  ) {
    throw new UnsafeOutboxDataError(
      `Credential-shaped data is not allowed in ${location}.`,
    );
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
    assertSafeText(value, location);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new UnsafeOutboxDataError(
        `Non-finite numbers are not allowed in ${location}.`,
      );
    }
    return;
  }
  if (typeof value !== "object") {
    throw new UnsafeOutboxDataError(
      `Only JSON-compatible values are allowed in ${location}.`,
    );
  }
  if (ancestors.has(value)) {
    throw new UnsafeOutboxDataError(
      `Circular values are not allowed in ${location}.`,
    );
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertJsonAndCredentialSafe(item, `${location}[${index}]`, ancestors),
    );
    ancestors.delete(value);
    return;
  }

  if (!isPlainObject(value)) {
    throw new UnsafeOutboxDataError(
      `Only plain JSON objects are allowed in ${location}.`,
    );
  }

  for (const [key, child] of Object.entries(value)) {
    if (sensitiveKeys.has(normalizedKey(key))) {
      throw new UnsafeOutboxDataError(
        `Credential field ${location}.${key} is not allowed in outbox payloads.`,
      );
    }
    assertJsonAndCredentialSafe(child, `${location}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

export function serializeSafeOutboxPayload(payload: object): OutboxJsonValue {
  assertJsonAndCredentialSafe(payload, "payload", new WeakSet());
  return JSON.parse(JSON.stringify(payload)) as OutboxJsonValue;
}

export function assertSafeOutboxFailure(lastError: string): string {
  const normalized = lastError.trim();
  if (normalized.length === 0 || normalized.length > 4_000) {
    throw new UnsafeOutboxDataError(
      "Outbox failure metadata must contain between 1 and 4000 characters.",
    );
  }
  assertSafeText(normalized, "lastError");
  return normalized;
}
