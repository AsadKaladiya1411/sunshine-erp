import type { AnyDomainEvent } from "./domain-event.types.js";

export class DomainEventDispatchError extends AggregateError {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;

  constructor(event: AnyDomainEvent, handlerErrors: readonly unknown[]) {
    super(
      [...handlerErrors],
      `${handlerErrors.length} handler(s) failed while dispatching ${event.eventType} v${event.eventVersion}.`,
    );
    this.name = "DomainEventDispatchError";
    this.eventId = event.eventId;
    this.eventType = event.eventType;
    this.eventVersion = event.eventVersion;
  }
}
