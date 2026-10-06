import { describe, expect, it } from "vitest";

import { ClassChange } from "./class-change";
import { Holiday } from "./holiday";

const original = {
  id: "change-1",
  workspaceId: "org_1",
  batchId: "batch-1",
  date: "2026-11-04",
  startTime: "09:00",
  endTime: "11:00",
};
const now = new Date("2026-11-02T04:00:00.000Z");
const localNow = { date: "2026-11-02", minutes: 9 * 60 + 30 };
const saturday = { date: "2026-11-07", startTime: "16:00", endTime: "18:00" };

describe("ClassChange", () => {
  it("cancels a Class with a trimmed, optional reason", () => {
    const change = ClassChange.cancel(original, {
      reason: "  Pongal  ",
      userId: "user_owner",
      now,
    });
    expect(change.toFact()).toMatchObject({
      kind: "cancelled",
      reason: "Pongal",
      movedTo: null,
    });
    expect(
      ClassChange.cancel(original, { reason: " ", userId: "u", now }).toFact()
        .reason,
    ).toBeNull();
  });

  it("rejects a reason over 200 characters", () => {
    expect(() =>
      ClassChange.cancel(original, {
        reason: "x".repeat(201),
        userId: "u",
        now,
      }),
    ).toThrow(
      expect.objectContaining({ code: "CLASS_CHANGE_REASON_TOO_LONG" }),
    );
  });

  it("moves a Class to a future slot", () => {
    const change = ClassChange.move(original, {
      to: saturday,
      userId: "u",
      now,
      localNow,
    });
    expect(change.toFact()).toMatchObject({ kind: "moved", movedTo: saturday });
  });

  it.each([
    [{ ...saturday, date: "2026-02-30" }, "CLASS_DATE_INVALID"],
    [{ ...saturday, startTime: "9am" }, "CLASS_TIME_INVALID"],
    [{ ...saturday, endTime: "15:00" }, "CLASS_TIME_INVALID"],
    [
      { date: original.date, startTime: "09:00", endTime: "10:00" },
      "CLASS_MOVE_SAME_SLOT",
    ],
    [
      { date: "2026-11-02", startTime: "09:00", endTime: "10:00" },
      "CLASS_MOVE_IN_PAST",
    ],
    [
      { date: "2026-11-01", startTime: "16:00", endTime: "17:00" },
      "CLASS_MOVE_IN_PAST",
    ],
  ])("rejects moving to %o", (to, code) => {
    expect(() =>
      ClassChange.move(original, { to, userId: "u", now, localNow }),
    ).toThrow(expect.objectContaining({ code }));
  });

  it("can move a Rescheduled Class again or cancel it instead", () => {
    const change = ClassChange.move(original, {
      to: saturday,
      userId: "u",
      now,
      localNow,
    });
    change.moveAgain({
      to: { date: "2026-11-08", startTime: "10:00", endTime: "12:00" },
      userId: "teacher",
      now,
      localNow,
    });
    expect(change.toFact()).toMatchObject({
      date: original.date,
      movedTo: { date: "2026-11-08", startTime: "10:00" },
    });
    change.cancelInstead({ reason: "Exams", userId: "u", now, localNow });
    expect(change.toFact()).toMatchObject({
      kind: "cancelled",
      reason: "Exams",
      movedTo: null,
    });
  });

  it("restores a Class that hasn't happened yet", () => {
    const change = ClassChange.cancel(original, { userId: "u", now });
    change.restore({ userId: "u", now, localNow });
    expect(change.deletedAt).toEqual(now);
  });

  it("refuses to restore once the original or new slot has started", () => {
    const later = { date: "2026-11-05", minutes: 0 };
    expect(() => {
      ClassChange.cancel(original, { userId: "u", now }).restore({
        userId: "u",
        now,
        localNow: later,
      });
    }).toThrow(expect.objectContaining({ code: "CLASS_ALREADY_STARTED" }));
    const moved = ClassChange.move(
      { ...original, date: "2026-11-11" },
      { to: saturday, userId: "u", now, localNow },
    );
    expect(() => {
      moved.restore({
        userId: "u",
        now,
        localNow: { date: "2026-11-07", minutes: 17 * 60 },
      });
    }).toThrow(expect.objectContaining({ code: "CLASS_ALREADY_STARTED" }));
  });
});

describe("Holiday", () => {
  const declare = (overrides: Partial<Parameters<typeof Holiday.declare>[0]>) =>
    Holiday.declare({
      id: "holiday-1",
      workspaceId: "org_1",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      reason: "Diwali",
      userId: "user_owner",
      now,
      today: "2026-10-30",
      ...overrides,
    });

  it("declares one date or a range starting today or later", () => {
    expect(declare({}).toFact()).toEqual({
      id: "holiday-1",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      reason: "Diwali",
    });
    expect(
      declare({ startDate: "2026-10-30", endDate: "2026-10-30" }).toFact(),
    ).toMatchObject({ startDate: "2026-10-30" });
  });

  it.each([
    [{ startDate: "2026-11-31" }, "HOLIDAY_DATES_INVALID"],
    [
      { endDate: "2026-10-31", startDate: "2026-11-01" },
      "HOLIDAY_DATES_INVALID",
    ],
    [{ startDate: "2026-10-29" }, "HOLIDAY_IN_PAST"],
    [{ endDate: "2027-02-01" }, "HOLIDAY_TOO_LONG"],
    [{ reason: "x".repeat(201) }, "HOLIDAY_REASON_TOO_LONG"],
  ])("rejects %o", (overrides, code) => {
    expect(() => declare(overrides)).toThrow(expect.objectContaining({ code }));
  });

  it("detects overlapping ranges", () => {
    const holiday = declare({});
    expect(
      holiday.overlaps({ startDate: "2026-11-03", endDate: "2026-11-05" }),
    ).toBe(true);
    expect(
      holiday.overlaps({ startDate: "2026-11-04", endDate: "2026-11-05" }),
    ).toBe(false);
  });

  it("can be removed until its first day has passed", () => {
    const holiday = declare({});
    expect(() => {
      holiday.remove({ userId: "u", now, today: "2026-11-02" });
    }).toThrow(expect.objectContaining({ code: "HOLIDAY_STARTED" }));
    holiday.remove({ userId: "u", now, today: "2026-11-01" });
    expect(holiday.toProps().deletedAt).toEqual(now);
  });
});
