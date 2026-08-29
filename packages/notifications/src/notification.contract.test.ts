import { describe, expect, it } from "@jest/globals";
import {
  parseNotificationRequest,
  type NotificationRequest,
} from "./notification.contract.js";
import { NotificationInvalidError } from "./notification.errors.js";

const validRequest: NotificationRequest = {
  notificationType: "generic.notice",
  channel: "email",
  recipients: [{ reference: "recipient@example.test" }],
  subject: "Foundation notification",
  content: "A generic infrastructure notification.",
  templateData: {
    displayName: "Foundation User",
    itemCount: 2,
    enabled: true,
    optionalValue: null,
  },
  organizationId: "5c6cd9db-c03b-4a9b-a386-f46220ec6ae8",
  correlationId: "foundation-correlation-1",
};

describe("notification contract", () => {
  it("accepts a valid generic notification request", () => {
    expect(parseNotificationRequest(validRequest)).toEqual(validRequest);
  });

  it.each([
    {},
    { ...validRequest, channel: "fax" },
    { ...validRequest, recipients: [] },
    { ...validRequest, notificationType: "purchase pending" },
    { ...validRequest, unexpectedField: "not allowed" },
  ])("rejects invalid or unsupported notification request %#", (request) => {
    expect(() => parseNotificationRequest(request)).toThrow(
      NotificationInvalidError,
    );
  });

  it("accepts only narrow scalar template data", () => {
    expect(
      parseNotificationRequest({
        ...validRequest,
        templateData: {
          text: "safe",
          count: 4,
          visible: false,
          optional: null,
        },
      }).templateData,
    ).toEqual({ text: "safe", count: 4, visible: false, optional: null });

    expect(() =>
      parseNotificationRequest({
        ...validRequest,
        templateData: { nested: { expression: "not allowed" } },
      }),
    ).toThrow(NotificationInvalidError);
  });

  it.each([
    { templateData: { passwordHash: "not-a-real-hash" } },
    { templateData: { accessToken: "not-a-real-token" } },
    { content: "Authorization: Bearer secret-provider-value" },
    { content: "password=secret-provider-value" },
    { recipients: [{ reference: "Bearer secret-provider-value" }] },
  ])("rejects credential-shaped notification data %#", (unsafeValues) => {
    expect(() =>
      parseNotificationRequest({ ...validRequest, ...unsafeValues }),
    ).toThrow(NotificationInvalidError);
  });
});
