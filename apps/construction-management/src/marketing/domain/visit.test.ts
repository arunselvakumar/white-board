import { describe, expect, it } from "vitest";

import {
  assertCompletable,
  cancelReason,
  isVisitLocked,
  isVisitVisible,
  noteText,
  shownStatus,
  visitDetails,
  visitorIds,
} from "./visit";

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

const NOW = new Date("2026-11-12T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("Visit details (PRD §3.4)", () => {
  it("tidies the texts and keeps the requirement", () => {
    expect(
      visitDetails({
        purpose: "requirement_discussion",
        location: "  Sulur  site office ",
        discussion: " Needs a 40 m PEB shed.\n\nTender in January. ",
        interest: "hot",
        requirementWorkType: "peb",
        requirementValue: 25_000_000,
        requirementStartMonth: "2027-01",
      }),
    ).toEqual({
      purpose: "requirement_discussion",
      location: "Sulur site office",
      discussion: "Needs a 40 m PEB shed.\n\nTender in January.",
      outcome: null,
      interest: "hot",
      requirementWorkType: "peb",
      requirementValue: 25_000_000,
      requirementStartMonth: "2027-01",
    });
  });

  it("refuses a fractional or negative value and a bad month", () => {
    expect(code(() => visitDetails({ requirementValue: 10.5 }))).toBe(
      "VISIT_VALUE_INVALID",
    );
    expect(code(() => visitDetails({ requirementValue: -1 }))).toBe(
      "VISIT_VALUE_INVALID",
    );
    expect(code(() => visitDetails({ requirementStartMonth: "2027-13" }))).toBe(
      "VISIT_START_MONTH_INVALID",
    );
    expect(code(() => visitDetails({ requirementStartMonth: "0000-01" }))).toBe(
      "VISIT_START_MONTH_INVALID",
    );
  });
});

describe("Completing a Visit (ADR CM-0040 §7)", () => {
  const ready = {
    visitAt: new Date(NOW.getTime() - 60_000),
    now: NOW,
    contactCount: 1,
    discussion: "Talked about the shed.",
  };

  it("needs a past time, a point of contact and the Discussion", () => {
    expect(() => {
      assertCompletable(ready);
    }).not.toThrow();
    expect(
      code(() => {
        assertCompletable({
          ...ready,
          visitAt: new Date(NOW.getTime() + 60_000),
        });
      }),
    ).toBe("VISIT_IN_FUTURE");
    expect(
      code(() => {
        assertCompletable({ ...ready, contactCount: 0 });
      }),
    ).toBe("VISIT_CONTACT_REQUIRED");
    expect(
      code(() => {
        assertCompletable({ ...ready, discussion: null });
      }),
    ).toBe("VISIT_DISCUSSION_REQUIRED");
  });

  it("needs words to cancel and to add a note", () => {
    expect(code(() => cancelReason("  "))).toBe("VISIT_CANCEL_REASON_REQUIRED");
    expect(cancelReason(" Client away ")).toBe("Client away");
    expect(code(() => noteText(""))).toBe("VISIT_NOTE_REQUIRED");
  });
});

describe("Visitors (ADR CM-0040 §5)", () => {
  const own = { userId: "user-1", memberId: "member-1" };

  it("defaults to the creator and drops repeats", () => {
    expect(
      visitorIds({ given: undefined, self: "member-1", scope: own }),
    ).toEqual(["member-1"]);
    expect(
      visitorIds({
        given: ["member-1", "member-2", "member-1"],
        self: "member-1",
        scope: own,
      }),
    ).toEqual(["member-1", "member-2"]);
  });

  it("makes a member without View all include themselves", () => {
    expect(
      code(() =>
        visitorIds({ given: ["member-2"], self: "member-1", scope: own }),
      ),
    ).toBe("VISITOR_SELF_REQUIRED");
    expect(
      visitorIds({ given: ["member-2"], self: "member-1", scope: null }),
    ).toEqual(["member-2"]);
    expect(
      code(() => visitorIds({ given: [], self: "member-1", scope: null })),
    ).toBe("VISITOR_REQUIRED");
  });
});

describe("Who sees a Visit (ADR CM-0040 §5)", () => {
  const visit = { createdBy: "user-1", visitorIds: ["member-2", "member-3"] };

  it("shows the creator and every visitor, and no one else", () => {
    expect(isVisitVisible(visit, null)).toBe(true);
    expect(isVisitVisible(visit, { userId: "user-1", memberId: null })).toBe(
      true,
    );
    expect(
      isVisitVisible(visit, { userId: "user-9", memberId: "member-3" }),
    ).toBe(true);
    expect(
      isVisitVisible(visit, { userId: "user-9", memberId: "member-9" }),
    ).toBe(false);
  });
});

describe("Missed and the lock (ADR CM-0040 §7)", () => {
  it("shows a Planned Visit whose time passed as Missed", () => {
    expect(
      shownStatus(
        { status: "planned", visitAt: new Date(NOW.getTime() - 1) },
        NOW,
      ),
    ).toBe("missed");
    expect(
      shownStatus(
        { status: "planned", visitAt: new Date(NOW.getTime() + 1) },
        NOW,
      ),
    ).toBe("planned");
    expect(
      shownStatus(
        { status: "cancelled", visitAt: new Date(NOW.getTime() - 1) },
        NOW,
      ),
    ).toBe("cancelled");
  });

  it("lets the creator change a Completed Visit for 7 days, then only View all", () => {
    const completed = {
      status: "completed" as const,
      completedAt: new Date(NOW.getTime() - 7 * DAY + 1000),
      createdBy: "user-1",
    };
    const creator = { userId: "user-1", viewAll: false, now: NOW };
    expect(isVisitLocked(completed, creator)).toBe(false);
    expect(
      isVisitLocked(
        { ...completed, completedAt: new Date(NOW.getTime() - 7 * DAY - 1000) },
        creator,
      ),
    ).toBe(true);
    expect(
      isVisitLocked(
        { ...completed, completedAt: new Date(NOW.getTime() - 30 * DAY) },
        { ...creator, viewAll: true },
      ),
    ).toBe(false);
    // A co-visitor who did not log it cannot change it.
    expect(isVisitLocked(completed, { ...creator, userId: "user-2" })).toBe(
      true,
    );
    expect(
      isVisitLocked(
        { ...completed, status: "planned" },
        { ...creator, userId: "user-2" },
      ),
    ).toBe(false);
  });
});
