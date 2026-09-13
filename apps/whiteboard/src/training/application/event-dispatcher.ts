import type { DomainEvent } from "../domain/events";

export type EventDispatcher = {
  dispatch(events: readonly DomainEvent[]): Promise<void>;
};
