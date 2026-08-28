import type { AnyDomainEvent } from "./domain-event.types.js";

export interface DomainEventPublisher {
  publish<TEvent extends AnyDomainEvent>(event: TEvent): Promise<void>;
}
