import { describe, expect, it } from "vitest";

import type { AuditRecord } from "@/src/shared-kernel/audit-reader";

import { projectChangesOf } from "./sign-in-project-history";

let clock = 0;

function event(action: string, after: unknown): AuditRecord {
  clock += 1000;
  return {
    id: `e${String(clock)}`,
    action,
    entityId: "m1",
    actorUserId: "owner",
    occurredAt: new Date(clock),
    before: null,
    after,
  };
}

describe("projectChangesOf", () => {
  it("diffs each event's Projects against the set before it", () => {
    const events = [
      event("team_member.invited", { projectIds: ["p1"] }),
      event("team_member.photo_changed", null),
      event("team_member.projects_changed", { projectIds: ["p1", "p2"] }),
      event("team_member.password_set", { status: "active" }),
      event("team_member.projects_changed", { projectIds: ["p2"] }),
      event("team_member.removed", { projectIds: ["p2"] }),
    ];
    // Out of order on purpose: the walk sorts by time.
    const changes = projectChangesOf("m1", [...events].reverse());
    expect(
      changes.map((change) => [
        change.eventId,
        change.projectId,
        change.change,
      ]),
    ).toEqual([
      [events[0]?.id, "p1", "added"],
      [events[2]?.id, "p2", "added"],
      [events[4]?.id, "p1", "removed"],
      [events[5]?.id, "p2", "removed"],
    ]);
    expect(changes[0]).toMatchObject({ memberId: "m1", by: "owner" });
  });
});
