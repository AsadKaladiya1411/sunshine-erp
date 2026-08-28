export class DuplicateOutboxEventError extends Error {
  readonly eventId: string;

  constructor(eventId: string) {
    super(`An outbox event already exists for event ID ${eventId}.`);
    this.name = "DuplicateOutboxEventError";
    this.eventId = eventId;
  }
}

export class OutboxStateTransitionError extends Error {
  readonly eventId: string;

  constructor(eventId: string) {
    super(`Outbox event ${eventId} is not in a transitionable Pending state.`);
    this.name = "OutboxStateTransitionError";
    this.eventId = eventId;
  }
}

export class UnsafeOutboxDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeOutboxDataError";
  }
}
