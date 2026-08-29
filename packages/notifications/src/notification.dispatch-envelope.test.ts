import { describe, expect, it } from "@jest/globals";
import { parseNotificationDispatchEnvelope } from "./notification.contract.js";
import { createNotificationDispatchEnvelope } from "./notification.dispatch-envelope.js";
import { NotificationInvalidError } from "./notification.errors.js";

describe("notification asynchronous dispatch boundary", () => {
  it("creates a versioned, JSON-safe envelope for future asynchronous delivery", () => {
    const envelope = createNotificationDispatchEnvelope({
      notificationId: "30dfbdc0-a147-4b9e-ae52-694935c68e3d",
      requestedAt: "2026-08-29T10:00:00.000Z",
      request: {
        notificationType: "generic.notice",
        channel: "push",
        recipients: [{ reference: "device-reference-1" }],
        content: "Generic asynchronous notification.",
        templateData: { displayName: "Foundation User", count: 1 },
        organizationId: "fb54a14b-4a5f-43e4-9c8a-49b339d16d3b",
        correlationId: "correlation-async-1",
      },
    });

    expect(
      parseNotificationDispatchEnvelope(
        JSON.parse(JSON.stringify(envelope)) as unknown,
      ),
    ).toEqual(envelope);
    expect(envelope.schemaVersion).toBe(1);
  });

  it("rejects an envelope whose nested request is unsafe", () => {
    expect(() =>
      createNotificationDispatchEnvelope({
        notificationId: "30dfbdc0-a147-4b9e-ae52-694935c68e3d",
        requestedAt: "2026-08-29T10:00:00.000Z",
        request: {
          notificationType: "generic.notice",
          channel: "email",
          recipients: [{ reference: "recipient@example.test" }],
          content: "api_key=provider-secret",
        },
      }),
    ).toThrow(NotificationInvalidError);
  });
});
