import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  fakeDirectory,
  FakeLabourAttendanceStore,
  FakeLabourBackdatedGuard,
} from "./labour-attendance-fakes";
import {
  dayCode,
  formatHundredths,
  LabourAttendanceHandlers,
  type AttendanceLabourer,
  type MarkLabourDayInput,
} from "./labour-attendance-handlers";

const NOW = new Date("2026-10-08T06:00:00Z");
const TODAY = "2026-10-08"; // a Thursday
const YESTERDAY = "2026-10-07";

function labourer(
  id: string,
  options: Partial<AttendanceLabourer> & { monthly?: boolean } = {},
): AttendanceLabourer {
  return {
    id,
    name: id === "raju" ? "Raju Pawar" : id === "sita" ? "Sita Kale" : id,
    labourCode: null,
    isActive: true,
    labourCategoryId: "mason",
    supervisorId: "sunil",
    weeklyHolidays: [0],
    card: options.monthly
      ? {
          wageType: "monthly",
          wagePerDay: null,
          wagePerMonth: 3_100_000,
          overtimeWagePerHour: 15_000,
        }
      : {
          wageType: "daily",
          wagePerDay: 70_000,
          wagePerMonth: null,
          overtimeWagePerHour: 10_000,
        },
    ...options,
  };
}

function setup() {
  const store = new FakeLabourAttendanceStore(TODAY);
  store.add(labourer("raju"), "p1", "2026-09-01");
  store.add(labourer("sita", { monthly: true }), "p1", "2026-09-01");
  store.add(labourer("old", { isActive: false }), "p1", "2026-09-01");
  store.add(labourer("moved"), "p1", "2026-09-01");
  store.transfer("moved", "p2", "2026-10-05");
  store.categories = [{ id: "mason", name: "Mason" }];
  const guard = new FakeLabourBackdatedGuard();
  // Each command a millisecond later, so updatedAt changes on every write.
  let tick = 0;
  const handlers = new LabourAttendanceHandlers(
    store,
    fakeDirectory({ p1: "Tower A", p2: "Villa" }),
    fakeDirectory({ mason: "Mason" }),
    fakeDirectory({ sunil: "Sunil" }),
    guard,
    () => new Date(NOW.getTime() + tick++),
  );
  return { store, guard, handlers };
}

const OWNER = { workspaceId: "w1", userId: "u1", role: "owner" as const };

function mark(overrides: Partial<MarkLabourDayInput> = {}): MarkLabourDayInput {
  return {
    actor: OWNER,
    projectId: "p1",
    date: TODAY,
    marks: [
      {
        labourId: "raju",
        status: "present",
        overtime: [{ labourCategoryId: "mason", hours: "1.5" }],
      },
      { labourId: "sita", status: "half_day" },
    ],
    canCreate: true,
    canEdit: true,
    ...overrides,
  };
}

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("expected a DomainError");
}

describe("LabourAttendanceHandlers.markDay", () => {
  it("prices many labourers and posts earned + overtime to the ledger", async () => {
    const { store, handlers, guard } = setup();
    const saved = await handlers.markDay(mark());
    expect(saved.map((day) => day.labourName)).toEqual([
      "Raju Pawar",
      "Sita Kale",
    ]);
    expect(saved[0]).toMatchObject({
      earned: 70_000,
      overtimeHours: "1.5",
      overtimeAmount: 15_000,
      total: 85_000,
      supervisor: { id: "sunil", name: "Sunil" },
    });
    // Monthly: 31,000 ÷ 31 days × ½.
    expect(saved[1]?.earned).toBe(50_000);
    expect(store.balance("raju")).toBe(85_000);
    expect(store.balance("sita")).toBe(50_000);
    expect(guard.checks).toEqual([{ action: "create", date: TODAY }]);
  });

  it("refuses inactive, off-project and unknown labourers with details.labourId", async () => {
    const { handlers } = setup();
    const inactive = await failure(
      handlers.markDay(
        mark({ marks: [{ labourId: "old", status: "present" }] }),
      ),
    );
    expect(inactive.code).toBe("LABOUR_INACTIVE");
    expect(inactive.details).toMatchObject({ labourId: "old" });

    const moved = await failure(
      handlers.markDay(
        mark({ marks: [{ labourId: "moved", status: "present" }] }),
      ),
    );
    expect(moved.code).toBe("LABOUR_NOT_ON_PROJECT");
    expect(moved.details).toMatchObject({ labourId: "moved", projectId: "p2" });
    // Before the transfer the day belongs to p1.
    await handlers.markDay(
      mark({
        date: "2026-10-04",
        marks: [{ labourId: "moved", status: "present" }],
      }),
    );

    const unknown = await failure(
      handlers.markDay(
        mark({ marks: [{ labourId: "ghost", status: "present" }] }),
      ),
    );
    expect(unknown.kind).toBe("not_found");
  });

  it("refuses overtime on an absent day, unknown categories and supervisors, and future dates", async () => {
    const { handlers } = setup();
    const absent = await failure(
      handlers.markDay(
        mark({
          marks: [
            { labourId: "sita", status: "present" },
            {
              labourId: "raju",
              status: "absent",
              overtime: [{ labourCategoryId: null, hours: 2 }],
            },
          ],
        }),
      ),
    );
    expect(absent.code).toBe("OVERTIME_ON_ABSENT_DAY");
    expect(absent.details).toMatchObject({ labourId: "raju" });

    const category = await failure(
      handlers.markDay(
        mark({
          marks: [
            {
              labourId: "raju",
              status: "present",
              overtime: [{ labourCategoryId: "welder", hours: 1 }],
            },
          ],
        }),
      ),
    );
    expect(category.code).toBe("LABOUR_CATEGORY_NOT_FOUND");

    const supervisor = await failure(
      handlers.markDay(
        mark({
          marks: [{ labourId: "raju", status: "present", supervisorId: "x" }],
        }),
      ),
    );
    expect(supervisor.code).toBe("SUPERVISOR_NOT_FOUND");

    const future = await failure(
      handlers.markDay(mark({ date: "2026-10-09" })),
    );
    expect(future.code).toBe("ATTENDANCE_DATE_IN_FUTURE");
  });

  it("re-marks with expected updatedAt, reversing and reposting; stale or missing → 409", async () => {
    const { store, handlers, guard } = setup();
    const [raju] = await handlers.markDay(mark());
    if (raju == null) throw new Error("no row");

    const missing = await failure(
      handlers.markDay(
        mark({ marks: [{ labourId: "raju", status: "absent" }] }),
      ),
    );
    expect(missing.code).toBe("ATTENDANCE_CHANGED");
    expect(missing.details).toEqual({ labourId: "raju" });

    const stale = await failure(
      handlers.markDay(
        mark({
          marks: [{ labourId: "raju", status: "absent" }],
          expected: { raju: new Date("2026-01-01") },
        }),
      ),
    );
    expect(stale.code).toBe("ATTENDANCE_CHANGED");

    const noEdit = await failure(
      handlers.markDay(
        mark({
          marks: [{ labourId: "raju", status: "absent" }],
          expected: { raju: raju.updatedAt },
          canEdit: false,
        }),
      ),
    );
    expect(noEdit.code).toBe("PERMISSION_DENIED");

    const [again] = await handlers.markDay(
      mark({
        marks: [{ labourId: "raju", status: "absent" }],
        expected: { raju: raju.updatedAt },
      }),
    );
    expect(again?.id).toBe(raju.id);
    expect(again?.total).toBe(0);
    expect(store.balance("raju")).toBe(0);
    expect(guard.checks.at(-1)).toEqual({ action: "edit", date: TODAY });
    expect(store.audits).toContain("labour_attendance.updated");
  });

  it("keeps a saved overtime rate when a re-mark sends none", async () => {
    const { handlers } = setup();
    const [raju] = await handlers.markDay(
      mark({
        marks: [
          {
            labourId: "raju",
            status: "present",
            overtime: [
              { labourCategoryId: "mason", hours: 1, ratePerHour: 20_000 },
            ],
          },
        ],
      }),
    );
    if (raju == null) throw new Error("no row");
    // A member without Financial re-marks: the line comes back without a rate.
    const [again] = await handlers.markDay(
      mark({
        marks: [
          {
            labourId: "raju",
            status: "present",
            overtime: [{ labourCategoryId: "mason", hours: 2 }],
          },
        ],
        expected: { raju: raju.updatedAt },
      }),
    );
    expect(again?.overtimeAmount).toBe(40_000);
  });

  it("applies the back-dated guard", async () => {
    const { handlers, guard } = setup();
    guard.refuse = "create";
    const refused = await failure(handlers.markDay(mark({ date: YESTERDAY })));
    expect(refused.code).toBe("BACKDATED_CREATE_BLOCKED");
  });
});

describe("LabourAttendanceHandlers paid leave and clear", () => {
  it("toggles Paid Leave on a leave day and clears days", async () => {
    const { store, handlers } = setup();
    const [leave] = await handlers.markDay(
      mark({ marks: [{ labourId: "raju", status: "on_leave" }] }),
    );
    if (leave == null) throw new Error("no row");
    expect(store.balance("raju")).toBe(0);
    const paid = await handlers.setPaidLeave({
      actor: OWNER,
      attendanceId: leave.id,
      isPaidLeave: true,
      expectedUpdatedAt: leave.updatedAt,
    });
    expect(paid.isPaidLeave).toBe(true);
    expect(store.balance("raju")).toBe(70_000);

    const stale = await failure(
      handlers.setPaidLeave({
        actor: OWNER,
        attendanceId: leave.id,
        isPaidLeave: false,
        expectedUpdatedAt: leave.updatedAt,
      }),
    );
    expect(stale.code).toBe("ATTENDANCE_CHANGED");

    await handlers.clearDay({
      actor: OWNER,
      projectId: "p1",
      date: TODAY,
      labourIds: ["raju"],
      expected: { raju: paid.updatedAt },
    });
    expect(store.balance("raju")).toBe(0);
    const gone = await failure(
      handlers.clearDay({
        actor: OWNER,
        projectId: "p1",
        date: TODAY,
        labourIds: ["raju"],
        expected: { raju: paid.updatedAt },
      }),
    );
    expect(gone.code).toBe("ATTENDANCE_NOT_FOUND");
    expect(gone.details).toEqual({ labourId: "raju" });
  });

  it("refuses Paid Leave on a day that is not On Leave", async () => {
    const { handlers } = setup();
    const [present] = await handlers.markDay(
      mark({ marks: [{ labourId: "raju", status: "present" }] }),
    );
    if (present == null) throw new Error("no row");
    const refused = await failure(
      handlers.setPaidLeave({
        actor: OWNER,
        attendanceId: present.id,
        isPaidLeave: true,
        expectedUpdatedAt: present.updatedAt,
      }),
    );
    expect(refused.code).toBe("PAID_LEAVE_NEEDS_LEAVE");
  });
});

describe("LabourAttendanceHandlers queries", () => {
  it("builds the sheet with weekly-holiday and yesterday hints", async () => {
    const { handlers } = setup();
    await handlers.markDay(
      mark({
        date: YESTERDAY,
        marks: [{ labourId: "raju", status: "half_day", shift: "Shift 1" }],
      }),
    );
    const sunday = await handlers.sheet("w1", "p1", "2026-10-04");
    expect(
      sunday.labourers.map((row) => [row.name, row.suggestedStatus]),
    ).toEqual([
      ["moved", "holiday"],
      ["Raju Pawar", "holiday"],
      ["Sita Kale", "holiday"],
    ]);
    const today = await handlers.sheet("w1", "p1", TODAY);
    expect(today.labourers.map((row) => row.name)).toEqual([
      "Raju Pawar",
      "Sita Kale",
    ]);
    expect(today.labourers[0]).toMatchObject({
      suggestedStatus: "half_day",
      yesterday: { status: "half_day", shift: "Shift 1" },
      canMark: true,
      attendance: null,
      labourCategory: { id: "mason", name: "Mason" },
    });
    expect(today.labourCategories).toEqual([{ id: "mason", name: "Mason" }]);
    expect(today.supervisors).toEqual([{ id: "sunil", name: "Sunil" }]);
  });

  it("totals the month grid per labourer", async () => {
    const { handlers } = setup();
    await handlers.markDay(mark({ date: "2026-10-01" }));
    await handlers.markDay(
      mark({
        date: "2026-10-02",
        marks: [
          { labourId: "raju", status: "on_leave", isPaidLeave: true },
          { labourId: "sita", status: "holiday" },
        ],
      }),
    );
    const grid = await handlers.month("w1", "p1", "2026-10");
    expect(grid.dates).toHaveLength(31);
    const raju = grid.labourers.find((row) => row.labourId === "raju");
    expect(raju?.days.map((day) => day.code)).toEqual(["P", "PL"]);
    expect(raju?.totals).toMatchObject({
      present: 1,
      paidLeave: 1,
      overtimeHours: "1.5",
      earned: 140_000,
      overtimeAmount: 15_000,
      total: 155_000,
    });
    const sita = grid.labourers.find((row) => row.labourId === "sita");
    expect(sita?.totals).toMatchObject({
      halfDay: 1,
      holiday: 1,
      earned: 150_000,
    });
    expect(grid.dayCounts[0]).toEqual({
      date: "2026-10-01",
      present: 1,
      halfDay: 1,
      marked: 2,
    });
  });

  it("formats codes and hours", () => {
    expect(dayCode("on_leave", false)).toBe("L");
    expect(dayCode("holiday", false)).toBe("HO");
    expect(formatHundredths(250)).toBe("2.5");
    expect(formatHundredths(1025)).toBe("10.25");
  });
});
