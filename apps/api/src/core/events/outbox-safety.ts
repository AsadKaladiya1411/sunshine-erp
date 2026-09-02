import {
  assertDomainEventCredentialSafeText,
  InvalidDomainEventPayloadError,
  normalizeDomainEventPayload,
} from "./domain-event-payload.js";
import type { OutboxJsonValue } from "./outbox-event.types.js";
import { UnsafeOutboxDataError } from "./outbox.errors.js";

function asUnsafeOutboxDataError(error: unknown): never {
  if (error instanceof InvalidDomainEventPayloadError) {
    throw new UnsafeOutboxDataError(error.message);
  }
  throw error;
}

export function serializeSafeOutboxPayload(payload: object): OutboxJsonValue {
  try {
    return normalizeDomainEventPayload(payload) as OutboxJsonValue;
  } catch (error: unknown) {
    return asUnsafeOutboxDataError(error);
  }
}

export function assertSafeOutboxFailure(lastError: string): string {
  const normalized = lastError.trim();
  if (normalized.length === 0 || normalized.length > 4_000) {
    throw new UnsafeOutboxDataError(
      "Outbox failure metadata must contain between 1 and 4000 characters.",
    );
  }
  try {
    assertDomainEventCredentialSafeText(normalized, "lastError");
  } catch (error: unknown) {
    return asUnsafeOutboxDataError(error);
  }
  return normalized;
}
