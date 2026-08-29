import {
  parseNotificationDispatchEnvelope,
  type NotificationDispatchEnvelope,
} from "./notification.contract.js";

export interface CreateNotificationDispatchEnvelopeInput {
  readonly notificationId: string;
  readonly requestedAt: string;
  readonly request: unknown;
}

export function createNotificationDispatchEnvelope(
  input: CreateNotificationDispatchEnvelopeInput,
): NotificationDispatchEnvelope {
  return parseNotificationDispatchEnvelope({
    schemaVersion: 1,
    notificationId: input.notificationId,
    requestedAt: input.requestedAt,
    request: input.request,
  });
}
