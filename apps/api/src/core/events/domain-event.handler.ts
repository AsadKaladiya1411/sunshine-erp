import type {
  AnyDomainEventDefinition,
  DomainEventFrom,
} from "./domain-event.types.js";

export interface DomainEventHandler<
  TDefinition extends AnyDomainEventDefinition,
> {
  handle(event: DomainEventFrom<TDefinition>): void | Promise<void>;
}
