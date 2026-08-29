import type {
  NotificationChannel,
  NotificationDeliveryResult,
  NotificationRequest,
} from "./notification.contract.js";
import {
  NotificationChannelUnavailableError,
  NotificationInvalidError,
  NotificationNotConfiguredError,
} from "./notification.errors.js";

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(request: NotificationRequest): Promise<NotificationDeliveryResult>;
}

export class NotificationChannelRegistry {
  private readonly providers = new Map<
    NotificationChannel,
    NotificationProvider
  >();

  constructor(providers: readonly NotificationProvider[] = []) {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  register(provider: NotificationProvider): void {
    if (this.providers.has(provider.channel)) {
      throw new NotificationInvalidError();
    }
    this.providers.set(provider.channel, provider);
  }

  resolve(channel: NotificationChannel): NotificationProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new NotificationChannelUnavailableError();
    }
    return provider;
  }
}

export class NotConfiguredNotificationProvider implements NotificationProvider {
  constructor(public readonly channel: NotificationChannel) {}

  async send(
    _request: NotificationRequest,
  ): Promise<NotificationDeliveryResult> {
    throw new NotificationNotConfiguredError();
  }
}
