import { z } from "zod";
import { NotificationInvalidError } from "./notification.errors.js";

export const notificationChannels = [
  "in-app",
  "email",
  "sms",
  "whatsapp",
  "push",
] as const;

export const notificationChannelSchema = z.enum(notificationChannels);

const notificationIdentifierSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

const correlationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const templateKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/);

const templateValueSchema = z.union([
  z.string().max(1_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const sensitiveTemplateKeyPattern =
  /^(?:password|passwordhash|passwd|pwd|token|accesstoken|refreshtoken|resettoken|jwt|authorization|cookie|apikey|providersecret|clientsecret|privatekey|smtpcredential|smscredential|whatsappcredential|pushcredential)$/i;

const credentialValuePatterns = [
  /\bBearer\s+\S+/i,
  /\bBasic\s+[A-Za-z0-9+/=]+/i,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/i,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\b(?:password|passwd|pwd|token|api[_-]?key|secret|authorization|cookie)\s*[:=]\s*\S+/i,
  /\b(?:postgresql|postgres|redis|rediss|amqp|amqps):\/\/[^\s:@/]+:[^\s@/]+@/i,
] as const;

function containsCredentialShapedValue(value: string): boolean {
  return credentialValuePatterns.some((pattern) => pattern.test(value));
}

export const notificationRecipientSchema = z
  .object({
    reference: z.string().trim().min(1).max(512),
  })
  .strict();

export const notificationRequestSchema = z
  .object({
    notificationType: notificationIdentifierSchema,
    channel: notificationChannelSchema,
    recipients: z.array(notificationRecipientSchema).min(1).max(100),
    subject: z.string().trim().min(1).max(200).optional(),
    content: z.string().min(1).max(20_000),
    templateData: z.record(templateKeySchema, templateValueSchema).optional(),
    organizationId: z.string().uuid().optional(),
    correlationId: correlationIdSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    request.recipients.forEach((recipient, index) => {
      if (containsCredentialShapedValue(recipient.reference)) {
        context.addIssue({
          code: "custom",
          path: ["recipients", index, "reference"],
          message: "Recipient reference must not contain credentials.",
        });
      }
    });

    if (request.subject && containsCredentialShapedValue(request.subject)) {
      context.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Notification subject must not contain credentials.",
      });
    }

    if (containsCredentialShapedValue(request.content)) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Notification content must not contain credentials.",
      });
    }

    const templateEntries = Object.entries(request.templateData ?? {});
    if (templateEntries.length > 50) {
      context.addIssue({
        code: "custom",
        path: ["templateData"],
        message: "Template data contains too many variables.",
      });
    }

    for (const [key, value] of templateEntries) {
      const normalizedKey = key.replace(/_/g, "");
      if (sensitiveTemplateKeyPattern.test(normalizedKey)) {
        context.addIssue({
          code: "custom",
          path: ["templateData", key],
          message: "Template variable name is not allowed.",
        });
      }
      if (typeof value === "string" && containsCredentialShapedValue(value)) {
        context.addIssue({
          code: "custom",
          path: ["templateData", key],
          message: "Template variable must not contain credentials.",
        });
      }
    }
  });

export const notificationDeliveryResultSchema = z
  .object({
    status: z.literal("accepted"),
    channel: notificationChannelSchema,
    acceptedAt: z.string().datetime({ offset: true }),
    providerReference: z.string().trim().min(1).max(256).optional(),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.providerReference &&
      containsCredentialShapedValue(result.providerReference)
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerReference"],
        message: "Provider reference must not contain credentials.",
      });
    }
  });

export const notificationDispatchEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    notificationId: z.string().uuid(),
    requestedAt: z.string().datetime({ offset: true }),
    request: notificationRequestSchema,
  })
  .strict();

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type NotificationRecipient = z.infer<typeof notificationRecipientSchema>;
export type NotificationTemplateValue = z.infer<typeof templateValueSchema>;
export type NotificationTemplateData = Readonly<
  Record<string, NotificationTemplateValue>
>;
export type NotificationRequest = z.infer<typeof notificationRequestSchema>;
export type NotificationDeliveryResult = z.infer<
  typeof notificationDeliveryResultSchema
>;
export type NotificationDispatchEnvelope = z.infer<
  typeof notificationDispatchEnvelopeSchema
>;

export function parseNotificationRequest(input: unknown): NotificationRequest {
  const result = notificationRequestSchema.safeParse(input);
  if (!result.success) {
    throw new NotificationInvalidError();
  }
  return result.data;
}

export function parseNotificationDispatchEnvelope(
  input: unknown,
): NotificationDispatchEnvelope {
  const result = notificationDispatchEnvelopeSchema.safeParse(input);
  if (!result.success) {
    throw new NotificationInvalidError();
  }
  return result.data;
}
