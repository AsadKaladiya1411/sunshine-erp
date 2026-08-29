import { describe, expect, it, jest } from "@jest/globals";
import {
  NotificationChannelRegistry,
  type NotificationProvider,
} from "./notification.channel.js";
import type { NotificationRequest } from "./notification.contract.js";
import {
  NotificationChannelUnavailableError,
  NotificationDeliveryError,
  NotificationInvalidError,
  NotificationProviderUnavailableError,
} from "./notification.errors.js";
import {
  NotificationService,
  type NotificationOperationalLogger,
} from "./notification.service.js";

const request: NotificationRequest = {
  notificationType: "generic.notice",
  channel: "in-app",
  recipients: [{ reference: "5c57cf00-f60e-4733-a9cd-31dc9e174d4e" }],
  subject: "Generic notice",
  content: "Infrastructure boundary content.",
  organizationId: "81f3fe5a-112d-4b10-aa3b-05714ebce55a",
  correlationId: "correlation-123",
};

function recordingLogger(): {
  readonly logger: NotificationOperationalLogger;
  readonly records: unknown[];
} {
  const records: unknown[] = [];
  return {
    records,
    logger: {
      info(bindings, message) {
        records.push({ level: "info", bindings, message });
      },
      warn(bindings, message) {
        records.push({ level: "warn", bindings, message });
      },
    },
  };
}

function successfulProvider(): NotificationProvider {
  return {
    channel: "in-app",
    send: jest.fn(async () => ({
      status: "accepted" as const,
      channel: "in-app" as const,
      acceptedAt: "2026-08-29T10:00:00.000Z",
      providerReference: "provider-reference-1",
    })),
  };
}

describe("notification service", () => {
  it("validates, selects the channel, and returns a typed accepted result", async () => {
    const provider = successfulProvider();
    const service = new NotificationService(
      new NotificationChannelRegistry([provider]),
    );

    await expect(service.deliver(request)).resolves.toEqual({
      status: "accepted",
      channel: "in-app",
      acceptedAt: "2026-08-29T10:00:00.000Z",
      providerReference: "provider-reference-1",
    });
    expect(provider.send).toHaveBeenCalledWith(request);
  });

  it("rejects invalid input before provider selection", async () => {
    const provider = successfulProvider();
    const service = new NotificationService(
      new NotificationChannelRegistry([provider]),
    );

    await expect(
      service.deliver({ ...request, content: "token=secret-value" }),
    ).rejects.toBeInstanceOf(NotificationInvalidError);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("returns a typed error when the requested channel is unavailable", async () => {
    const service = new NotificationService(new NotificationChannelRegistry());

    await expect(service.deliver(request)).rejects.toBeInstanceOf(
      NotificationChannelUnavailableError,
    );
  });

  it("propagates a predictable provider-unavailable error", async () => {
    const provider: NotificationProvider = {
      channel: "in-app",
      async send() {
        throw new NotificationProviderUnavailableError();
      },
    };
    const service = new NotificationService(
      new NotificationChannelRegistry([provider]),
    );

    await expect(service.deliver(request)).rejects.toBeInstanceOf(
      NotificationProviderUnavailableError,
    );
  });

  it("maps raw provider failures and invalid success responses to delivery failure", async () => {
    const failingProvider: NotificationProvider = {
      channel: "in-app",
      async send() {
        throw new Error("raw provider failure");
      },
    };
    const wrongChannelProvider = {
      channel: "in-app" as const,
      async send() {
        return {
          status: "accepted" as const,
          channel: "sms" as const,
          acceptedAt: "2026-08-29T10:00:00.000Z",
        };
      },
    } as unknown as NotificationProvider;

    await expect(
      new NotificationService(
        new NotificationChannelRegistry([failingProvider]),
      ).deliver(request),
    ).rejects.toBeInstanceOf(NotificationDeliveryError);
    await expect(
      new NotificationService(
        new NotificationChannelRegistry([wrongChannelProvider]),
      ).deliver(request),
    ).rejects.toBeInstanceOf(NotificationDeliveryError);
  });

  it("never logs provider credentials, recipient references, or notification content", async () => {
    const providerCredential = "smtp-provider-password-must-not-leak";
    const recipientMarker = "private-recipient@example.test";
    const bodyMarker = "private-notification-body-marker";
    const provider: NotificationProvider = {
      channel: "in-app",
      async send() {
        throw new Error(`provider failed with ${providerCredential}`);
      },
    };
    const recording = recordingLogger();
    const service = new NotificationService(
      new NotificationChannelRegistry([provider]),
      recording.logger,
    );

    await expect(
      service.deliver({
        ...request,
        recipients: [{ reference: recipientMarker }],
        content: bodyMarker,
      }),
    ).rejects.toBeInstanceOf(NotificationDeliveryError);

    const serializedLogs = JSON.stringify(recording.records);
    expect(serializedLogs).not.toContain(providerCredential);
    expect(serializedLogs).not.toContain(recipientMarker);
    expect(serializedLogs).not.toContain(bodyMarker);
    expect(serializedLogs).toContain("NOTIFICATION_DELIVERY_FAILED");
  });
});
