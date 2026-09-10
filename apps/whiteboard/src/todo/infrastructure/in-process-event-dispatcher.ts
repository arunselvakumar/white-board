import type { DomainEvent } from "../domain/todo-events";
import type { EventDispatcher } from "../application/event-dispatcher";

export type DomainEventListener = {
  handle(event: DomainEvent): Promise<void> | void;
};

export class InProcessEventDispatcher implements EventDispatcher {
  constructor(
    private readonly listeners: readonly DomainEventListener[] = [],
  ) {}

  async dispatch(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const listener of this.listeners) {
        await listener.handle(event);
      }
    }
  }
}
