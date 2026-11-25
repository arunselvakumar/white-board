import { describe, expect, it } from "vitest";

import type { PreschoolActor } from "./access";
import { canEditAnnouncement } from "./announcement-handlers";
import { canEditObservation } from "./observation-handlers";

function actor(overrides: Partial<PreschoolActor>): PreschoolActor {
  return {
    workspaceId: "ws",
    userId: "user",
    userName: "User",
    role: "owner",
    centreIds: ["main", "branch"],
    classroomIds: [],
    childIds: [],
    ...overrides,
  };
}

const branchHead = actor({ role: "centre_head", centreIds: ["branch"] });
const teacher = actor({ role: "teacher", centreIds: ["main"] });

describe("who may change an Observation", () => {
  const record = { centreId: "main", createdByUserId: "author" };

  it("its author and the managers of its Centre", () => {
    expect(canEditObservation(actor({}), record)).toBe(true);
    expect(canEditObservation({ ...teacher, userId: "author" }, record)).toBe(
      true,
    );
    expect(
      canEditObservation(
        actor({ role: "centre_head", centreIds: ["main"] }),
        record,
      ),
    ).toBe(true);
  });

  it("not another Centre's Centre Head nor another Teacher", () => {
    expect(canEditObservation(branchHead, record)).toBe(false);
    expect(canEditObservation(teacher, record)).toBe(false);
  });
});

describe("who may change an Announcement", () => {
  it("every Centre's: the Owner only", () => {
    const all = { centreId: null, createdByUserId: "user" };
    expect(canEditAnnouncement(actor({}), all)).toBe(true);
    expect(canEditAnnouncement({ ...branchHead, userId: "user" }, all)).toBe(
      false,
    );
  });

  it("a Centre's: its author and its managers, never a Parent", () => {
    const main = { centreId: "main", createdByUserId: "author" };
    expect(canEditAnnouncement(branchHead, main)).toBe(false);
    expect(canEditAnnouncement(teacher, main)).toBe(false);
    expect(canEditAnnouncement({ ...teacher, userId: "author" }, main)).toBe(
      true,
    );
    expect(
      canEditAnnouncement(
        actor({ role: "parent", userId: "author", centreIds: ["main"] }),
        main,
      ),
    ).toBe(false);
  });
});
