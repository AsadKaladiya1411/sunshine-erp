import { describe, expect, it, jest } from "@jest/globals";
import {
  NotConfiguredNotificationProvider,
  NotificationChannelRegistry,
  type NotificationProvider,
} from "./notification.channel.js";
import {
  NotificationChannelUnavailableError,
  NotificationInvalidError,
  NotificationNotConfiguredError,
} from "./notification.errors.js";

function emailProvider(): NotificationProvider {
  return {
    channel: "email",
    send: jest.fn(async () => ({
      status: "accepted" as const,
      channel: "email" as const,
      acceptedAt: "2026-08-29T10:00:00.000Z",
    })),
  };
}

describe("notification channel registry", () => {
  it("registers and selects a provider by channel", () => {
    const provider = emailProvider();
    const registry = new NotificationChannelRegistry();

    registry.register(provider);

    expect(registry.resolve("email")).toBe(provider);
  });

  it("rejects duplicate channel registration", () => {
    const registry = new NotificationChannelRegistry([emailProvider()]);

    expect(() => registry.register(emailProvider())).toThrow(
      NotificationInvalidError,
    );
  });

  it("returns a typed error when a known channel has no provider", () => {
    const registry = new NotificationChannelRegistry();

    expect(() => registry.resolve("sms")).toThrow(
      NotificationChannelUnavailableError,
    );
  });

  it("never pretends delivery succeeded for an unconfigured provider", async () => {
    const provider = new NotConfiguredNotificationProvider("whatsapp");

    await expect(
      provider.send({
        notificationType: "generic.notice",
        channel: "whatsapp",
        recipients: [{ reference: "+910000000000" }],
        content: "Generic notification.",
      }),
    ).rejects.toBeInstanceOf(NotificationNotConfiguredError);
  });
});
