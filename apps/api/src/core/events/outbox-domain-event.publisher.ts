import type { DatabaseTransaction } from "../database/transaction.js";
import type { DomainEventPublisher } from "./domain-event.publisher.js";
import type { AnyDomainEvent } from "./domain-event.types.js";
import {
  outboxRepository,
  type OutboxRepository,
} from "./outbox.repository.js";

export class OutboxDomainEventPublisher implements DomainEventPublisher {
  constructor(
    private readonly transaction: DatabaseTransaction,
    private readonly repository: OutboxRepository = outboxRepository,
  ) {}

  async publish<TEvent extends AnyDomainEvent>(event: TEvent): Promise<void> {
    await this.repository.append(this.transaction, event);
  }
}

export function createOutboxDomainEventPublisher(
  transaction: DatabaseTransaction,
): DomainEventPublisher {
  return new OutboxDomainEventPublisher(transaction);
}
