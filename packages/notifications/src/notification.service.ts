import {
  notificationDeliveryResultSchema,
  parseNotificationRequest,
  type NotificationDeliveryResult,
  type NotificationRequest,
} from "./notification.contract.js";
import { NotificationChannelRegistry } from "./notification.channel.js";
import {
  NotificationDeliveryError,
  NotificationInfrastructureError,
  NotificationInvalidError,
} from "./notification.errors.js";

export interface NotificationOperationalLogger {
  info(bindings: Readonly<Record<string, unknown>>, message: string): void;
  warn(bindings: Readonly<Record<string, unknown>>, message: string): void;
}

const silentNotificationLogger: NotificationOperationalLogger = {
  info: () => undefined,
  warn: () => undefined,
};

function safeRequestMetadata(
  request: NotificationRequest,
): Readonly<Record<string, unknown>> {
  return {
    component: "notifications",
    channel: request.channel,
    notificationType: request.notificationType,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
  };
}

export class NotificationService {
  constructor(
    private readonly channels: NotificationChannelRegistry,
    private readonly operationalLogger: NotificationOperationalLogger = silentNotificationLogger,
  ) {}

  async deliver(input: unknown): Promise<NotificationDeliveryResult> {
    let request: NotificationRequest;
    try {
      request = parseNotificationRequest(input);
    } catch {
      const error = new NotificationInvalidError();
      this.operationalLogger.warn(
        { component: "notifications", errorCode: error.code },
        "Notification request rejected",
      );
      throw error;
    }

    try {
      const provider = this.channels.resolve(request.channel);
      const rawResult = await provider.send(request);
      const result = notificationDeliveryResultSchema.safeParse(rawResult);
      if (!result.success || result.data.channel !== request.channel) {
        throw new NotificationDeliveryError();
      }

      this.operationalLogger.info(
        safeRequestMetadata(request),
        "Notification accepted by channel provider",
      );
      return Object.freeze(result.data);
    } catch (error: unknown) {
      const safeError =
        error instanceof NotificationInfrastructureError
          ? error
          : new NotificationDeliveryError();
      this.operationalLogger.warn(
        { ...safeRequestMetadata(request), errorCode: safeError.code },
        "Notification delivery failed",
      );
      throw safeError;
    }
  }
}
