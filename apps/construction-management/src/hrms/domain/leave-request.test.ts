import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  applyTransition,
  approveTransition,
  assertLeaveRange,
  assertNoOverlap,
  assertTypeAllows,
  datesBetween,
  decideCancellationTransition,
  leaveReason,
  optionalRemarks,
  overlappingDates,
  planLeaveDays,
  rejectTransition,
  requestCancellationTransition,
  requiredReason,
  withdrawTransition,
  type LeaveCalendarDay,
  type LeaveRequestState,
} from "./leave-request";

function fault(run: () => unknown): {
  code: string;
  kind: string;
  field?: unknown;
} {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        kind: error.kind,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("expected a DomainError");
}

// Friday 2026-10-09 to Tuesday 2026-10-13, Monday a holiday.
const FRI_TO_TUE: LeaveCalendarDay[] = [
  { date: "2026-10-09", kind: "working" },
  { date: "2026-10-10", kind: "week_off" },
  { date: "2026-10-11", kind: "week_off" },
  { date: "2026-10-12", kind: "holiday" },
  { date: "2026-10-13", kind: "working" },
];

const PENDING: LeaveRequestState = {
  memberId: "member-a",
  status: "pending",
  approvalLevels: 1,
  currentLevel: 1,
  totalDays: 2,
  levelDeciders: [],
};

const APPROVER = { memberId: "member-b", isOwner: false };

describe("leave dates and day breakdown (ADR CM-0012 §10)", () => {
  it("skips week offs and holidays: Friday to Tuesday over a weekend and a holiday is 2 days", () => {
    const plan = planLeaveDays({ calendar: FRI_TO_TUE });
    expect(plan.total).toBe(2);
    expect(plan.days).toEqual([
      { date: "2026-10-09", session: "full" },
      { date: "2026-10-13", session: "full" },
    ]);
    expect(plan.skipped).toEqual([
      { date: "2026-10-10", kind: "week_off" },
      { date: "2026-10-11", kind: "week_off" },
      { date: "2026-10-12", kind: "holiday" },
    ]);
  });

  it("counts a morning or an afternoon as half a day", () => {
    const plan = planLeaveDays({
      calendar: FRI_TO_TUE,
      sessions: { "2026-10-13": "afternoon" },
    });
    expect(plan.total).toBe(1.5);
    expect(plan.days[1]).toEqual({ date: "2026-10-13", session: "afternoon" });
  });

  it("refuses a session on a day off or outside the range, and a range with no working day", () => {
    expect(
      fault(() =>
        planLeaveDays({
          calendar: FRI_TO_TUE,
          sessions: { "2026-10-12": "morning" },
        }),
      ),
    ).toMatchObject({ code: "LEAVE_DAY_NOT_WORKING", field: "days" });
    expect(
      fault(() =>
        planLeaveDays({
          calendar: FRI_TO_TUE,
          sessions: { "2026-10-20": "morning" },
        }),
      ),
    ).toMatchObject({ code: "LEAVE_DAY_NOT_WORKING" });
    expect(
      fault(() =>
        planLeaveDays({
          calendar: FRI_TO_TUE,
          sessions: { "2026-10-09": "evening" },
        }),
      ),
    ).toMatchObject({ code: "LEAVE_SESSION_INVALID" });
    expect(
      fault(() => planLeaveDays({ calendar: FRI_TO_TUE.slice(1, 4) })),
    ).toMatchObject({ code: "LEAVE_NO_WORKING_DAYS", field: "fromDate" });
  });

  it("checks the range", () => {
    expect(() => {
      assertLeaveRange("2026-10-09", "2026-10-09");
    }).not.toThrow();
    expect(
      fault(() => {
        assertLeaveRange("2026-02-30", "2026-03-01");
      }),
    ).toEqual({
      code: "LEAVE_DATE_INVALID",
      kind: "invalid",
      field: "fromDate",
    });
    expect(
      fault(() => {
        assertLeaveRange("2026-10-09", "2026-10-08");
      }),
    ).toEqual({
      code: "LEAVE_TO_BEFORE_FROM",
      kind: "invalid",
      field: "toDate",
    });
    expect(
      fault(() => {
        assertLeaveRange("2026-01-01", "2027-01-02");
      }),
    ).toEqual({
      code: "LEAVE_RANGE_TOO_LONG",
      kind: "invalid",
      field: "toDate",
    });
    expect(datesBetween("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("needs a reason of at least 10 characters", () => {
    expect(leaveReason("  Family function  ")).toBe("Family function");
    expect(fault(() => leaveReason("  Fever    "))).toMatchObject({
      code: "LEAVE_REASON_TOO_SHORT",
      field: "reason",
    });
    expect(fault(() => leaveReason("x".repeat(1001)))).toMatchObject({
      code: "LEAVE_REASON_TOO_LONG",
    });
  });

  it("keeps a request within the type's most days and refuses an inactive type", () => {
    const type = {
      name: "Casual Leave",
      isActive: true,
      maxConsecutiveDays: 3,
    };
    expect(() => {
      assertTypeAllows(type, 3);
    }).not.toThrow();
    expect(
      fault(() => {
        assertTypeAllows(type, 3.5);
      }),
    ).toMatchObject({
      code: "LEAVE_MAX_CONSECUTIVE_EXCEEDED",
      field: "toDate",
    });
    expect(
      fault(() => {
        assertTypeAllows({ ...type, isActive: false }, 1);
      }),
    ).toMatchObject({ code: "LEAVE_TYPE_INACTIVE", field: "leaveTypeId" });
  });
});

describe("overlap (CM-312)", () => {
  it("refuses a date already on leave, unless the two are opposite halves", () => {
    const taken = [{ date: "2026-10-09", session: "morning" as const }];
    expect(
      overlappingDates([{ date: "2026-10-09", session: "afternoon" }], taken),
    ).toEqual([]);
    expect(
      overlappingDates([{ date: "2026-10-09", session: "morning" }], taken),
    ).toEqual(["2026-10-09"]);
    expect(
      overlappingDates([{ date: "2026-10-09", session: "full" }], taken),
    ).toEqual(["2026-10-09"]);
    expect(
      overlappingDates(
        [{ date: "2026-10-09", session: "afternoon" }],
        [{ date: "2026-10-09", session: "full" }],
      ),
    ).toEqual(["2026-10-09"]);
    expect(
      fault(() => {
        assertNoOverlap([{ date: "2026-10-09", session: "full" }], taken);
      }),
    ).toMatchObject({ code: "LEAVE_OVERLAPS", kind: "conflict" });
  });
});

describe("leave request transitions (CM-312)", () => {
  it("approves at once with `used` when the type needs no approval", () => {
    expect(applyTransition(0, 2)).toEqual({
      status: "approved",
      approvalLevels: 1,
      currentLevel: 1,
      postings: [{ kind: "used", days: -2 }],
    });
  });

  it("waits at level 1 with a reservation otherwise", () => {
    expect(applyTransition(2, 1.5)).toEqual({
      status: "pending",
      approvalLevels: 2,
      currentLevel: 1,
      postings: [{ kind: "reserved", days: -1.5 }],
    });
  });

  it("approves with a release and `used`", () => {
    expect(approveTransition(PENDING, APPROVER)).toEqual({
      status: "approved",
      currentLevel: 1,
      postings: [
        { kind: "released", days: 2 },
        { kind: "used", days: -2 },
      ],
    });
  });

  it("moves a two-level request to level 2, then approves it with another approver", () => {
    const twoLevels = { ...PENDING, approvalLevels: 2 };
    expect(approveTransition(twoLevels, APPROVER)).toEqual({
      status: "pending",
      currentLevel: 2,
      postings: [],
    });
    const atLevelTwo: LeaveRequestState = {
      ...twoLevels,
      currentLevel: 2,
      levelDeciders: [{ level: 1, memberId: "member-b" }],
    };
    expect(fault(() => approveTransition(atLevelTwo, APPROVER))).toMatchObject({
      code: "LEAVE_ALREADY_APPROVED_BY_YOU",
      kind: "forbidden",
    });
    expect(
      approveTransition(atLevelTwo, { memberId: "member-c", isOwner: false })
        .status,
    ).toBe("approved");
    // The Owner may decide both levels.
    expect(
      approveTransition(
        { ...atLevelTwo, levelDeciders: [{ level: 1, memberId: "owner" }] },
        { memberId: "owner", isOwner: true },
      ).status,
    ).toBe("approved");
  });

  it("never lets a member decide their own request, but the Owner may", () => {
    expect(
      fault(() =>
        approveTransition(PENDING, { memberId: "member-a", isOwner: false }),
      ),
    ).toMatchObject({ code: "LEAVE_OWN_REQUEST", kind: "forbidden" });
    expect(
      fault(() =>
        rejectTransition(PENDING, { memberId: "member-a", isOwner: false }),
      ),
    ).toMatchObject({ code: "LEAVE_OWN_REQUEST" });
    expect(
      approveTransition(PENDING, { memberId: "member-a", isOwner: true })
        .status,
    ).toBe("approved");
  });

  it("rejects with the reservation released, and needs a reason", () => {
    expect(rejectTransition(PENDING, APPROVER)).toEqual({
      status: "rejected",
      currentLevel: 1,
      postings: [{ kind: "released", days: 2 }],
    });
    expect(
      fault(() => requiredReason("  ", "LEAVE_REJECTION_REASON_REQUIRED", "x")),
    ).toMatchObject({
      code: "LEAVE_REJECTION_REASON_REQUIRED",
      field: "reason",
    });
    expect(optionalRemarks("  ")).toBeNull();
    expect(optionalRemarks(" Enjoy ")).toBe("Enjoy");
  });

  it("withdraws a pending request only (ADR CM-0012 §8)", () => {
    expect(withdrawTransition(PENDING)).toEqual({
      status: "withdrawn",
      currentLevel: 1,
      postings: [{ kind: "released", days: 2 }],
    });
    for (const status of [
      "approved",
      "rejected",
      "withdrawn",
      "cancellation_requested",
      "cancelled",
    ] as const)
      expect(fault(() => withdrawTransition({ ...PENDING, status }))).toEqual({
        code: "LEAVE_REQUEST_STATE_CHANGED",
        kind: "conflict",
        field: undefined,
      });
  });

  it("refuses to decide a request that is no longer pending (two approvers)", () => {
    const approved = { ...PENDING, status: "approved" as const };
    expect(fault(() => approveTransition(approved, APPROVER))).toMatchObject({
      code: "LEAVE_REQUEST_STATE_CHANGED",
      kind: "conflict",
    });
    expect(fault(() => rejectTransition(approved, APPROVER))).toMatchObject({
      code: "LEAVE_REQUEST_STATE_CHANGED",
    });
  });

  it("asks to cancel approved leave, then restores the days when approved", () => {
    const approved = { ...PENDING, status: "approved" as const };
    expect(requestCancellationTransition(approved, true)).toEqual({
      status: "cancellation_requested",
      currentLevel: 1,
      postings: [],
    });
    const asked = { ...approved, status: "cancellation_requested" as const };
    expect(decideCancellationTransition(asked, APPROVER, true)).toEqual({
      status: "cancelled",
      currentLevel: 1,
      postings: [{ kind: "restored", days: 2 }],
    });
    expect(decideCancellationTransition(asked, APPROVER, false)).toEqual({
      status: "approved",
      currentLevel: 1,
      postings: [],
    });
    expect(
      fault(() =>
        decideCancellationTransition(
          asked,
          { memberId: "member-a", isOwner: false },
          true,
        ),
      ),
    ).toMatchObject({ code: "LEAVE_OWN_REQUEST" });
  });

  it("cancels at once when the type needs no approval", () => {
    expect(
      requestCancellationTransition({ ...PENDING, status: "approved" }, false),
    ).toEqual({
      status: "cancelled",
      currentLevel: 1,
      postings: [{ kind: "restored", days: 2 }],
    });
  });

  it("only cancels approved leave, and only decides asked cancellations", () => {
    expect(
      fault(() => requestCancellationTransition(PENDING, true)),
    ).toMatchObject({ code: "LEAVE_REQUEST_STATE_CHANGED" });
    expect(
      fault(() => decideCancellationTransition(PENDING, APPROVER, true)),
    ).toMatchObject({ code: "LEAVE_REQUEST_STATE_CHANGED" });
  });
});
