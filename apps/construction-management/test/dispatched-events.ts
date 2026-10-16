import { vi } from "vitest";

import {
  InProcessEventDispatcher,
  type DomainEvent,
} from "@/src/shared-kernel/events";

/**
 * Watches every in-process dispatch (CM-904): the modules raise their
 * after-commit events through `messagingEvents()`, an
 * `InProcessEventDispatcher`. Restore with `vi.restoreAllMocks()`.
 */
export function watchEvents() {
  const spy = vi.spyOn(InProcessEventDispatcher.prototype, "dispatch");
  return {
    /** The dispatched events of one type, in order. */
    of(type: string) {
      return spy.mock.calls
        .flatMap(([events]) => events)
        .filter((event) => event.type === type) as (DomainEvent &
        Record<string, unknown>)[];
    },
  };
}
