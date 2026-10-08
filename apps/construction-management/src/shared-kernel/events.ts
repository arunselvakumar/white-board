/**
 * In-process domain events (root ADR-0008). A context raises events from its
 * aggregates and application services; other contexts react through
 * listeners registered at composition time, never by importing the raiser.
 */
export type DomainEvent = {
  type: string;
  workspaceId: string;
  occurredAt: Date;
};

export type EventDispatcher = {
  dispatch(events: readonly DomainEvent[]): Promise<void>;
};

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
