import { describe, expect, it } from "vitest";

import type { DomainEvent } from "../domain/events";
import { InProcessEventDispatcher } from "./in-process-event-dispatcher";

describe("InProcessEventDispatcher", () => {
  it("delivers events to listeners in order", async () => {
    const seen: DomainEvent[] = [];
    const dispatcher = new InProcessEventDispatcher([
      {
        handle(event) {
          seen.push(event);
        },
      },
    ]);
    const created: DomainEvent = {
      type: "StudentCreated",
      studentId: "550e8400-e29b-41d4-a716-446655440000",
      workspaceId: "org_1",
      occurredAt: new Date("2026-09-12T00:00:00.000Z"),
    };

    await dispatcher.dispatch([created]);

    expect(seen).toEqual([created]);
  });

  it("is a no-op when there are no listeners", async () => {
    const dispatcher = new InProcessEventDispatcher();
    await expect(dispatcher.dispatch([])).resolves.toBeUndefined();
  });
});
