import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { Vendor } from "../domain/vendor";
import {
  FakeBackdatedGuard,
  FakeVendorAttendanceStore,
  fakeLookup,
  fakeVendorReader,
} from "./vendor-attendance-fakes";
import {
  hoursToHundredths,
  hundredthsToHours,
  VendorAttendanceHandlers,
  type RecordVendorDayInput,
} from "./vendor-attendance-handlers";

const NOW = new Date("2026-10-08T06:00:00Z");
const TODAY = "2026-10-08";

function vendor(
  id: string,
  options: { projectIds?: string[]; shifts?: boolean; active?: boolean } = {},
): Vendor {
  let next = 0;
  const created = Vendor.create({
    id,
    workspaceId: "w1",
    details: {
      name: id === "v1" ? "Muthu Gang" : `Vendor ${id}`,
      joiningDate: "2026-01-01",
    },
    projectIds: options.projectIds ?? ["p1"],
    shifts:
      options.shifts === false
        ? []
        : [
            {
              name: "Shift 1",
              rates: [
                {
                  labourCategoryId: "mason",
                  ratePerDay: 90_000,
                  overtimePerHour: 12_000,
                },
                {
                  labourCategoryId: "helper",
                  ratePerDay: 55_050,
                  overtimePerHour: 7_000,
                },
              ],
            },
            {
              name: "Night",
              rates: [
                {
                  labourCategoryId: "mason",
                  ratePerDay: 100_000,
                  overtimePerHour: 15_000,
                },
              ],
            },
          ],
    newShiftId: () => `${id}-s${String(++next)}`,
    by: "u1",
    now: NOW,
  });
  if (options.active === false) created.setActive(false, "u1", NOW);
  return created;
}

function setup(vendors: Vendor[] = [vendor("v1"), vendor("v2")]) {
  const store = new FakeVendorAttendanceStore();
  store.vendors = new Map(vendors.map((item) => [item.id, item.name]));
  const guard = new FakeBackdatedGuard();
  const lookup = fakeLookup({
    p1: "Tower A",
    p2: "Villa",
    mason: "Mason",
    helper: "Helper",
  });
  const handlers = new VendorAttendanceHandlers(
    store,
    fakeVendorReader(vendors, TODAY),
    lookup,
    lookup,
    guard,
    () => NOW,
  );
  return { store, guard, handlers };
}

const OWNER = { workspaceId: "w1", userId: "u1", role: "owner" as const };
const MEMBER = { workspaceId: "w1", userId: "u2", role: "member" as const };

function input(
  overrides: Partial<RecordVendorDayInput> = {},
): RecordVendorDayInput {
  return {
    actor: OWNER,
    projectId: "p1",
    vendorId: "v1",
    date: "2026-10-07",
    lines: [
      {
        shiftId: "v1-s1",
        labourCategoryId: "mason",
        fullDayCount: 3,
        halfDayCount: 1,
      },
      {
        shiftId: "v1-s1",
        labourCategoryId: "helper",
        fullDayCount: 2,
        halfDayCount: 0,
        overtimeHours: "1.5",
      },
    ],
    expectedUpdatedAt: null,
    canEdit: true,
    ...overrides,
  };
}

async function codeOf(
  run: () => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

// mason 3 × 900 + 1 × 450 = 3150; helper 2 × 550.50 + 1.5 × 70 = 1206.
const DAY_PAY = 315_000 + 120_600;

describe("VendorAttendanceHandlers.record", () => {
  it("prices the day from the rate card and posts one earned entry", async () => {
    const { store, guard, handlers } = setup();
    const day = await handlers.record(input());
    expect(day.totalPay).toBe(DAY_PAY);
    expect(day.lines.map((line) => line.amount)).toEqual([315_000, 120_600]);
    expect(day.lines[0]).toMatchObject({
      shiftName: "Shift 1",
      labourCategoryName: "Mason",
    });
    expect(day).toMatchObject({
      fullDayCount: 5,
      halfDayCount: 1,
      overtimeHours: "1.5",
    });
    expect(store.balance("v1")).toBe(DAY_PAY);
    expect(store.ledger[0]).toMatchObject({
      kind: "earned",
      partyType: "vendor",
      projectId: "p1",
      entryDate: "2026-10-07",
      sourceType: "vendor_attendance",
      sourceId: day.id,
    });
    expect(guard.checks).toEqual([{ action: "create", date: "2026-10-07" }]);
    expect(store.audits).toEqual(["vendor_attendance.recorded"]);
  });

  it("edits with expectedUpdatedAt: reverses, reposts and re-prices from the current card", async () => {
    const { store, guard, handlers } = setup();
    const first = await handlers.record(input());
    const edited = await handlers.record(
      input({
        lines: [
          {
            shiftId: "v1-s2",
            labourCategoryId: "mason",
            fullDayCount: 1,
            halfDayCount: 0,
          },
        ],
        expectedUpdatedAt: first.updatedAt,
      }),
    );
    expect(edited.id).toBe(first.id);
    expect(edited.totalPay).toBe(100_000);
    expect(store.balance("v1")).toBe(100_000);
    expect(store.ledger.map((entry) => entry.amount)).toEqual([
      DAY_PAY,
      -DAY_PAY,
      100_000,
    ]);
    expect(guard.checks.at(-1)).toEqual({ action: "edit", date: "2026-10-07" });
  });

  it("refuses a stale or missing expectedUpdatedAt, and an edit without the update flag", async () => {
    const { handlers } = setup();
    const first = await handlers.record(input());
    expect(await codeOf(() => handlers.record(input()))).toBe(
      "VENDOR_ATTENDANCE_CHANGED",
    );
    expect(
      await codeOf(() =>
        handlers.record(input({ expectedUpdatedAt: new Date("2026-01-01") })),
      ),
    ).toBe("VENDOR_ATTENDANCE_CHANGED");
    expect(
      await codeOf(() =>
        handlers.record(
          input({ expectedUpdatedAt: first.updatedAt, canEdit: false }),
        ),
      ),
    ).toBe("PERMISSION_DENIED");
    expect(
      await codeOf(() =>
        handlers.record(
          input({ date: "2026-10-06", expectedUpdatedAt: first.updatedAt }),
        ),
      ),
    ).toBe("VENDOR_ATTENDANCE_CHANGED");
  });

  it("refuses vendors that are off the Project, inactive or without a rate card", async () => {
    const { handlers } = setup([
      vendor("v1"),
      vendor("v2", { projectIds: ["p2"] }),
      vendor("v3", { active: false }),
      vendor("v4", { shifts: false }),
    ]);
    expect(await codeOf(() => handlers.record(input({ vendorId: "v2" })))).toBe(
      "VENDOR_NOT_ON_PROJECT",
    );
    expect(await codeOf(() => handlers.record(input({ vendorId: "v3" })))).toBe(
      "VENDOR_INACTIVE",
    );
    expect(await codeOf(() => handlers.record(input({ vendorId: "v4" })))).toBe(
      "VENDOR_NO_RATE_CARD",
    );
    expect(
      await codeOf(() => handlers.record(input({ vendorId: "nope" }))),
    ).toBe("VENDOR_NOT_FOUND");
    expect(
      await codeOf(() => handlers.record(input({ projectId: "gone" }))),
    ).toBe("PROJECT_NOT_FOUND");
  });

  it("names the failing line, and refuses future dates", async () => {
    const { handlers } = setup();
    let caught: unknown;
    try {
      await handlers.record(
        input({
          lines: [
            {
              shiftId: "v1-s1",
              labourCategoryId: "mason",
              fullDayCount: 1,
              halfDayCount: 0,
            },
            {
              shiftId: "v1-s2",
              labourCategoryId: "helper",
              fullDayCount: 1,
              halfDayCount: 0,
            },
          ],
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe("CATEGORY_NOT_ON_SHIFT");
    expect((caught as DomainError).details).toMatchObject({
      lineIndex: 1,
      shiftId: "v1-s2",
      labourCategoryId: "helper",
    });

    try {
      await handlers.record(
        input({
          lines: [
            {
              shiftId: "v1-s1",
              labourCategoryId: "mason",
              fullDayCount: 1,
              halfDayCount: 0,
            },
            {
              shiftId: "v1-s1",
              labourCategoryId: "mason",
              fullDayCount: 2,
              halfDayCount: 0,
            },
          ],
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect((caught as DomainError).code).toBe("DUPLICATE_SHIFT_CATEGORY");
    expect((caught as DomainError).details).toMatchObject({ lineIndex: 1 });

    expect(
      await codeOf(() =>
        handlers.record(
          input({
            lines: [
              {
                shiftId: "v1-s1",
                labourCategoryId: "mason",
                fullDayCount: -1,
                halfDayCount: 0,
              },
            ],
          }),
        ),
      ),
    ).toBe("HEADCOUNT_INVALID");
    expect(
      await codeOf(() => handlers.record(input({ date: "2026-10-09" }))),
    ).toBe("ATTENDANCE_DATE_IN_FUTURE");
    expect(await codeOf(() => handlers.record(input({ lines: [] })))).toBe(
      "ATTENDANCE_EMPTY",
    );
  });

  it("applies the back-dated guard to creates, edits and clears", async () => {
    const { guard, handlers } = setup();
    const recorded = await handlers.record(input({ date: "2026-10-01" }));
    guard.oldest = "2026-10-05";
    expect(
      await codeOf(() =>
        handlers.record(input({ actor: MEMBER, date: "2026-10-02" })),
      ),
    ).toBe("BACKDATED_CREATE_BLOCKED");
    expect(
      await codeOf(() =>
        handlers.record(
          input({
            actor: MEMBER,
            date: "2026-10-01",
            expectedUpdatedAt: recorded.updatedAt,
          }),
        ),
      ),
    ).toBe("BACKDATED_EDIT_BLOCKED");
    expect(
      await codeOf(() =>
        handlers.clear({
          actor: MEMBER,
          id: recorded.id,
          expectedUpdatedAt: null,
        }),
      ),
    ).toBe("BACKDATED_EDIT_BLOCKED");
  });
});

describe("VendorAttendanceHandlers.clear", () => {
  it("tombstones the day and reverses its entry", async () => {
    const { store, handlers } = setup();
    const day = await handlers.record(input());
    await handlers.clear({
      actor: OWNER,
      id: day.id,
      expectedUpdatedAt: day.updatedAt,
    });
    expect(store.balance("v1")).toBe(0);
    expect(await store.findById("w1", day.id)).toBeNull();
    expect(
      await codeOf(() =>
        handlers.clear({ actor: OWNER, id: day.id, expectedUpdatedAt: null }),
      ),
    ).toBe("VENDOR_ATTENDANCE_NOT_FOUND");
    // The day can be recorded again.
    const again = await handlers.record(input());
    expect(again.id).not.toBe(day.id);
    expect(store.balance("v1")).toBe(DAY_PAY);
  });
});

describe("VendorAttendanceHandlers queries", () => {
  it("builds the day grid with rate cards and recorded lines", async () => {
    const { handlers } = setup([
      vendor("v1"),
      vendor("v2", { shifts: false }),
      vendor("v3", { projectIds: ["p2"] }),
    ]);
    await handlers.record(input());
    const grid = await handlers.day("w1", "p1", "2026-10-07");
    expect(grid.vendors.map((row) => [row.vendorId, row.canRecord])).toEqual([
      ["v1", true],
      ["v2", false],
    ]);
    expect(grid.vendors[0]?.shifts[0]?.rates[0]).toMatchObject({
      labourCategoryName: "Mason",
      ratePerDay: 90_000,
    });
    expect(grid.vendors[0]?.attendance?.totalPay).toBe(DAY_PAY);
    expect(grid.totalPay).toBe(DAY_PAY);
    const empty = await handlers.day("w1", "p1", "2026-10-06");
    expect(empty.vendors[0]?.attendance).toBeNull();
  });

  it("keeps a recorded vendor in the grid after it left the Project", async () => {
    const muthu = vendor("v1");
    const { handlers } = setup([muthu]);
    await handlers.record(input());
    muthu.setActive(false, "u1", NOW);
    const grid = await handlers.day("w1", "p1", "2026-10-07");
    expect(grid.vendors).toHaveLength(1);
    expect(grid.vendors[0]).toMatchObject({
      vendorId: "v1",
      canRecord: false,
      isActive: false,
      shifts: [],
    });
  });

  it("totals the month per vendor, per category and per day", async () => {
    const { handlers } = setup();
    await handlers.record(input({ date: "2026-10-01" }));
    await handlers.record(input({ date: "2026-10-02" }));
    await handlers.record(
      input({
        vendorId: "v2",
        date: "2026-10-02",
        lines: [
          {
            shiftId: "v2-s2",
            labourCategoryId: "mason",
            fullDayCount: 0,
            halfDayCount: 0,
            overtimeHours: "2.25",
          },
        ],
      }),
    );
    await handlers.record(input({ date: "2026-09-30" }));
    const month = await handlers.month("w1", "p1", "2026-10");
    expect(month.dates).toHaveLength(31);
    expect(month.vendors.map((row) => row.vendorName)).toEqual([
      "Muthu Gang",
      "Vendor v2",
    ]);
    expect(month.vendors[0]?.totals).toEqual({
      fullDayCount: 10,
      halfDayCount: 2,
      overtimeHours: "3",
      pay: DAY_PAY * 2,
    });
    expect(month.vendors[1]?.totals).toMatchObject({
      overtimeHours: "2.25",
      pay: 33_750,
    });
    expect(
      month.categories.map((row) => [row.labourCategoryName, row.pay]),
    ).toEqual([
      ["Helper", 241_200],
      ["Mason", 630_000 + 33_750],
    ]);
    expect(month.dayTotals.map((row) => [row.date, row.pay])).toEqual([
      ["2026-10-01", DAY_PAY],
      ["2026-10-02", DAY_PAY + 33_750],
    ]);
    expect(month.totals.pay).toBe(DAY_PAY * 2 + 33_750);
    expect(await codeOf(() => handlers.month("w1", "p1", "2026-13"))).toBe(
      "MONTH_INVALID",
    );
  });

  it("lists overtime lines and filters the recorded list", async () => {
    const { handlers } = setup();
    await handlers.record(input({ date: "2026-10-01" }));
    await handlers.record(
      input({
        date: "2026-10-03",
        lines: [
          {
            shiftId: "v1-s1",
            labourCategoryId: "mason",
            fullDayCount: 1,
            halfDayCount: 0,
          },
        ],
      }),
    );
    const overtime = await handlers.overtime(
      "w1",
      "p1",
      "2026-10-01",
      "2026-10-08",
    );
    expect(overtime.items).toHaveLength(1);
    expect(overtime.items[0]).toMatchObject({
      vendorName: "Muthu Gang",
      labourCategoryName: "Helper",
      overtimeHours: "1.5",
      overtimeAmount: 10_500,
    });
    expect(overtime).toMatchObject({ totalHours: "1.5", totalAmount: 10_500 });
    expect(
      await codeOf(() =>
        handlers.overtime("w1", "p1", "2026-10-08", "2026-10-01"),
      ),
    ).toBe("DATE_RANGE_INVALID");

    const list = await handlers.list({
      workspaceId: "w1",
      projectId: "p1",
      labourCategoryId: "helper",
      page: 1,
      pageSize: 10,
    });
    expect(list.total).toBe(1);
    expect(list.items[0]?.date).toBe("2026-10-01");
    const all = await handlers.list({
      workspaceId: "w1",
      projectId: "p1",
      page: 1,
      pageSize: 10,
    });
    expect(all.items.map((item) => item.date)).toEqual([
      "2026-10-03",
      "2026-10-01",
    ]);
  });
});

describe("hours helpers", () => {
  it("sums hours exactly in hundredths", () => {
    expect(hoursToHundredths("1.5")).toBe(150);
    expect(hoursToHundredths("0.05")).toBe(5);
    expect(hoursToHundredths("12")).toBe(1200);
    expect(hundredthsToHours(150)).toBe("1.5");
    expect(hundredthsToHours(105)).toBe("1.05");
    expect(hundredthsToHours(1200)).toBe("12");
  });
});
