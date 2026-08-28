import type { DomainEventHandler } from "./domain-event.handler.js";
import type { DomainEventPublisher } from "./domain-event.publisher.js";
import type {
  AnyDomainEvent,
  AnyDomainEventDefinition,
  DomainEventFrom,
} from "./domain-event.types.js";
import { DomainEventDispatchError } from "./event.errors.js";

type RegisteredHandler = (event: AnyDomainEvent) => void | Promise<void>;

function registrationKey(
  definition: Pick<AnyDomainEvent, "eventType" | "eventVersion">,
): string {
  return `${definition.eventType}@${definition.eventVersion}`;
}

export class DomainEventDispatcher implements DomainEventPublisher {
  private readonly handlers = new Map<string, Set<RegisteredHandler>>();

  register<TDefinition extends AnyDomainEventDefinition>(
    definition: TDefinition,
    handler: DomainEventHandler<TDefinition>,
  ): () => void {
    const key = registrationKey(definition);
    const registeredHandler: RegisteredHandler = (event) =>
      handler.handle(event as DomainEventFrom<TDefinition>);
    const handlersForType = this.handlers.get(key) ?? new Set();
    handlersForType.add(registeredHandler);
    this.handlers.set(key, handlersForType);

    return () => {
      handlersForType.delete(registeredHandler);
      if (handlersForType.size === 0) {
        this.handlers.delete(key);
      }
    };
  }

  async publish<TEvent extends AnyDomainEvent>(event: TEvent): Promise<void> {
    const matchingHandlers = [
      ...(this.handlers.get(registrationKey(event)) ?? []),
    ];
    if (matchingHandlers.length === 0) {
      return;
    }

    const results = await Promise.allSettled(
      matchingHandlers.map((handler) =>
        Promise.resolve().then(() => handler(event)),
      ),
    );
    const handlerErrors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );

    if (handlerErrors.length > 0) {
      throw new DomainEventDispatchError(event, handlerErrors);
    }
  }
}

export const domainEventDispatcher = new DomainEventDispatcher();
