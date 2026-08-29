export type NotificationInfrastructureErrorCode =
  | "NOTIFICATION_INVALID"
  | "NOTIFICATION_CHANNEL_UNAVAILABLE"
  | "NOTIFICATION_PROVIDER_UNAVAILABLE"
  | "NOTIFICATION_DELIVERY_FAILED"
  | "NOTIFICATION_NOT_CONFIGURED";

export class NotificationInfrastructureError extends Error {
  constructor(
    public readonly code: NotificationInfrastructureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NotificationInfrastructureError";
  }
}

export class NotificationInvalidError extends NotificationInfrastructureError {
  constructor() {
    super("NOTIFICATION_INVALID", "Notification request is invalid.");
  }
}

export class NotificationChannelUnavailableError extends NotificationInfrastructureError {
  constructor() {
    super(
      "NOTIFICATION_CHANNEL_UNAVAILABLE",
      "Notification channel is unavailable.",
    );
  }
}

export class NotificationProviderUnavailableError extends NotificationInfrastructureError {
  constructor() {
    super(
      "NOTIFICATION_PROVIDER_UNAVAILABLE",
      "Notification provider is unavailable.",
    );
  }
}

export class NotificationDeliveryError extends NotificationInfrastructureError {
  constructor() {
    super("NOTIFICATION_DELIVERY_FAILED", "Notification delivery failed.");
  }
}

export class NotificationNotConfiguredError extends NotificationInfrastructureError {
  constructor() {
    super(
      "NOTIFICATION_NOT_CONFIGURED",
      "Notification provider is not configured.",
    );
  }
}
