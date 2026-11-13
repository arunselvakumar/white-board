import { describe, expect, it } from "vitest";

import {
  companiesInScope,
  followUpsInScope,
  latestValue,
  lastCompletedVisitAt,
  nextOpenDue,
  openAt,
  personSummary,
  stageOn,
  visitRegister,
  type PipelineVisit,
  type RegisterVisit,
  type SummaryFigures,
} from "./report-rows";
import { monthBounds } from "./team";

const NOW = new Date("2026-11-13T06:30:00Z");
const ASHA = { userId: "user-asha", memberId: "member-asha" };

function visit(
  id: string,
  overrides: Partial<RegisterVisit> = {},
): RegisterVisit {
  return {
    id,
    visitAt: new Date("2026-11-12T05:00:00Z"),
    status: "completed",
    checkedIn: false,
    createdBy: "user-ravi",
    visitorIds: ["member-ravi"],
    ...overrides,
  };
}

describe("Visit register rows (ADR CM-0040 §7, §13)", () => {
  it("shows a Planned Visit whose time passed without a check-in as Missed", () => {
    const rows = visitRegister(
      [
        visit("past", { status: "planned" }),
        visit("checked-in", { status: "planned", checkedIn: true }),
        visit("later", {
          status: "planned",
          visitAt: new Date("2026-11-14T05:00:00Z"),
        }),
        visit("done"),
        visit("off", { status: "cancelled" }),
      ],
      { scope: "all", now: NOW, status: null },
    );
    expect(Object.fromEntries(rows.map((row) => [row.id, row.shown]))).toEqual({
      past: "missed",
      "checked-in": "planned",
      later: "planned",
      done: "completed",
      off: "cancelled",
    });
  });

  it("filters by the shown status, so Missed and Planned are apart", () => {
    const visits = [
      visit("past", { status: "planned" }),
      visit("later", {
        status: "planned",
        visitAt: new Date("2026-11-14T05:00:00Z"),
      }),
    ];
    const ids = (status: "missed" | "planned") =>
      visitRegister(visits, { scope: "all", now: NOW, status }).map(
        (row) => row.id,
      );
    expect(ids("missed")).toEqual(["past"]);
    expect(ids("planned")).toEqual(["later"]);
  });

  it("lists newest first", () => {
    const rows = visitRegister(
      [
        visit("old", { visitAt: new Date("2026-11-01T05:00:00Z") }),
        visit("new", { visitAt: new Date("2026-11-10T05:00:00Z") }),
        visit("mid", { visitAt: new Date("2026-11-05T05:00:00Z") }),
      ],
      { scope: "all", now: NOW, status: null },
    );
    expect(rows.map((row) => row.id)).toEqual(["new", "mid", "old"]);
  });

  it("keeps a member's own Visits: created by them or one they went on (§5)", () => {
    const visits = [
      visit("created", { createdBy: ASHA.userId }),
      visit("went", { visitorIds: ["member-ravi", ASHA.memberId] }),
      visit("colleague's"),
    ];
    const ids = (scope: Parameters<typeof visitRegister>[1]["scope"]) =>
      visitRegister(visits, { scope, now: NOW, status: null })
        .map((row) => row.id)
        .sort();
    expect(ids(ASHA)).toEqual(["created", "went"]);
    expect(ids("all")).toEqual(["colleague's", "created", "went"]);
    expect(ids("none")).toEqual([]);
    // Without a Team Member, only what they created.
    expect(ids({ userId: ASHA.userId, memberId: null })).toEqual(["created"]);
  });

  it("names the earliest Open Follow-up as the next one", () => {
    expect(
      nextOpenDue([
        { status: "done", dueDate: "2026-11-14" },
        { status: "open", dueDate: "2026-11-20" },
        { status: "open", dueDate: "2026-11-16" },
      ]),
    ).toBe("2026-11-16");
    expect(nextOpenDue([{ status: "cancelled", dueDate: "2026-11-14" }])).toBe(
      null,
    );
  });
});

describe("the scope of companies and Follow-ups (ADR CM-0040 §5)", () => {
  it("keeps the companies a member created or is assigned", () => {
    const companies = [
      { id: "created", createdBy: ASHA.userId, assignedMemberId: null },
      {
        id: "assigned",
        createdBy: "user-ravi",
        assignedMemberId: "member-asha",
      },
      { id: "other", createdBy: "user-ravi", assignedMemberId: "member-ravi" },
    ];
    expect(companiesInScope(companies, ASHA).map((row) => row.id)).toEqual([
      "created",
      "assigned",
    ]);
    expect(companiesInScope(companies, "all")).toHaveLength(3);
    expect(companiesInScope(companies, "none")).toEqual([]);
  });

  it("keeps the Follow-ups a member created or owns", () => {
    const followUps = [
      { id: "created", createdBy: ASHA.userId, ownerMemberId: "member-ravi" },
      { id: "owned", createdBy: "user-ravi", ownerMemberId: "member-asha" },
      { id: "other", createdBy: "user-ravi", ownerMemberId: "member-ravi" },
    ];
    expect(followUpsInScope(followUps, ASHA).map((row) => row.id)).toEqual([
      "created",
      "owned",
    ]);
  });
});

describe("Marketing Person summary rows", () => {
  const people = [
    { id: "member-ravi", name: "Ravi", active: true },
    { id: "member-asha", name: "Asha", active: true },
    { id: "member-old", name: "Old Hand", active: false },
    { id: "member-idle", name: "Idle Former", active: false },
  ];
  const none = new Map<string, number>();
  const figures: SummaryFigures = {
    completed: new Map([
      ["member-ravi", 4],
      ["member-old", 1],
    ]),
    missed: new Map([["member-asha", 2]]),
    newCompanies: new Map([["member-left", 1]]),
    followUpsDone: none,
    followUpsOverdue: new Map([["member-ravi", 0]]),
    won: new Map([["member-ravi", 1]]),
  };

  it("lists every active person and anyone else with a figure, active first", () => {
    const rows = personSummary({
      month: "2026-11",
      people,
      otherNames: new Map([["member-left", "Left the Role"]]),
      figures,
      targets: [],
    });
    expect(rows.map((row) => [row.name, row.active])).toEqual([
      ["Asha", true],
      ["Ravi", true],
      ["Left the Role", false],
      ["Old Hand", false],
    ]);
    expect(rows.find((row) => row.name === "Ravi")).toMatchObject({
      completed: 4,
      missed: 0,
      won: 1,
      followUpsOverdue: 0,
    });
  });

  it("takes each month's target from the latest row on or before it", () => {
    const targets = [
      { memberId: "member-ravi", effectiveMonth: "2026-09", target: 10 },
      { memberId: "member-ravi", effectiveMonth: "2026-11", target: 15 },
      { memberId: "member-asha", effectiveMonth: "2026-12", target: 8 },
    ];
    const target = (month: string, name: string) =>
      personSummary({
        month,
        people,
        otherNames: new Map(),
        figures,
        targets,
      }).find((row) => row.name === name)?.target;
    expect(target("2026-10", "Ravi")).toBe(10);
    expect(target("2026-11", "Ravi")).toBe(15);
    expect(target("2026-11", "Asha")).toBeNull();
  });

  it("gives a member without View all only their own row, even an empty one", () => {
    const own = (onlyMemberId: string | null) =>
      personSummary({
        month: "2026-11",
        people,
        otherNames: new Map([["member-new", "New Joiner"]]),
        figures,
        targets: [],
        onlyMemberId,
      }).map((row) => row.name);
    expect(own("member-asha")).toEqual(["Asha"]);
    expect(own("member-new")).toEqual(["New Joiner"]);
    expect(own(null)).toEqual([]);
  });

  it("bounds a month from its first day to the next month's, across a year", () => {
    expect(monthBounds("2026-11")).toEqual({
      first: "2026-11-01",
      next: "2026-12-01",
    });
    expect(monthBounds("2026-12")).toEqual({
      first: "2026-12-01",
      next: "2027-01-01",
    });
  });
});

describe("Company pipeline rows", () => {
  const until = new Date("2026-11-13T18:30:00Z");
  const at = (iso: string, overrides: Partial<PipelineVisit> = {}) => ({
    visitAt: new Date(iso),
    status: "completed" as const,
    value: null,
    ...overrides,
  });

  it("takes the approximate value from the latest Visit that has one", () => {
    const visits = [
      at("2026-10-01T05:00:00Z", { value: 2_500_000 }),
      at("2026-10-20T05:00:00Z", { value: 4_000_000 }),
      // Later, but without a value.
      at("2026-11-02T05:00:00Z"),
      // Later still, but cancelled.
      at("2026-11-05T05:00:00Z", { status: "cancelled", value: 9_000_000 }),
      // After the as-on day.
      at("2026-11-20T05:00:00Z", { value: 7_000_000 }),
    ];
    expect(latestValue(visits, until)).toBe(4_000_000);
    expect(latestValue([at("2026-11-02T05:00:00Z")], until)).toBeNull();
  });

  it("takes the last Visit from the Completed ones up to the day", () => {
    const visits = [
      at("2026-10-20T05:00:00Z"),
      at("2026-11-12T05:00:00Z", { status: "planned" }),
      at("2026-11-20T05:00:00Z"),
    ];
    expect(lastCompletedVisitAt(visits, until)).toEqual(
      new Date("2026-10-20T05:00:00Z"),
    );
  });

  it("reads the Stage on the day from the Stage changes", () => {
    const changes = [
      { toStage: "new" as const, changedAt: new Date("2026-10-01T05:00:00Z") },
      {
        toStage: "quotation_sent" as const,
        changedAt: new Date("2026-11-01T05:00:00Z"),
      },
      { toStage: "won" as const, changedAt: new Date("2026-11-20T05:00:00Z") },
    ];
    expect(stageOn(changes, until, "won")).toBe("quotation_sent");
    expect(stageOn([], until, "contacted")).toBe("contacted");
  });

  it("counts a Follow-up as Open on the day until it was done or cancelled", () => {
    const made = new Date("2026-11-01T05:00:00Z");
    const later = new Date("2026-11-20T05:00:00Z");
    const earlier = new Date("2026-11-05T05:00:00Z");
    const base = { createdAt: made, doneAt: null, cancelledAt: null };
    expect(openAt({ ...base, status: "open" }, until)).toBe(true);
    expect(openAt({ ...base, status: "done", doneAt: later }, until)).toBe(
      true,
    );
    expect(openAt({ ...base, status: "done", doneAt: earlier }, until)).toBe(
      false,
    );
    expect(
      openAt({ ...base, status: "cancelled", cancelledAt: earlier }, until),
    ).toBe(false);
    expect(openAt({ ...base, status: "open", createdAt: later }, until)).toBe(
      false,
    );
  });
});
