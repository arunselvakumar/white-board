import type { DomainEvent } from "../domain/todo-events";

export type EventDispatcher = {
  dispatch(events: readonly DomainEvent[]): Promise<void>;
};
