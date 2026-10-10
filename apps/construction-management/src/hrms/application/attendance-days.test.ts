import { describe, expect, it } from "vitest";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { instantAt } from "../domain/company-time";
import { DEFAULT_HRMS_SETTINGS } from "../domain/hrms-settings";
import type { ShiftBook } from "../domain/effective-shift";
import {
  RecordedAttendanceDaySource,
  type DayEntryRow,
} from "./attendance-days";
import type { LeaveDay } from "./ports";

const IST = "Asia/Kolkata";
const at = (date: string, time: string) => instantAt(date, time, IST);

function book(): ShiftBook {
  return {
    settings: DEFAULT_HRMS_SETTINGS,
    assignments: [
      {
        id: "a1",
        shiftTemplateId: "general",
        rotationTemplateId: null,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    ],
    shifts: new Map([
      [
        "general",
        {
          id: "general",
          name: "General",
          startTime: "09:00",
          endTime: "18:00",
          workingDays: [1, 2, 3, 4, 5, 6],
          workingHours: 8,
          halfDayHours: 4,
          graceMinutes: 10,
          overtimeAllowed: true,
        },
      ],
    ]),
    rotations: new Map(),
  };
}

function source(entries: DayEntryRow[], leave: LeaveDay[] = []) {
  return new RecordedAttendanceDaySource({
    books: {
      booksFor: (_workspaceId, memberIds) =>
        Promise.resolve(new Map(memberIds.map((id) => [id, book()]))),
    },
    holidays: {
      holidaysBetween: () =>
        Promise.resolve([
          {
            id: "h1",
            name: "Gandhi Jayanti",
            date: "2026-10-02",
            type: "national" as const,
            isOptional: false,
          },
          {
            id: "h2",
            name: "Company Day",
            date: "2026-10-06",
            type: "company" as const,
            isOptional: true,
          },
        ]),
    },
    entries: {
      entriesBetween: (_workspaceId, memberIds, from, to) =>
        Promise.resolve(
          entries.filter(
            (entry) =>
              memberIds.includes(entry.memberId) &&
              entry.date >= from &&
              entry.date <= to,
          ),
        ),
    },
    leave: {
      approvedForMonth: (_workspaceId, memberIds) =>
        Promise.resolve(
          new Map(
            memberIds.map((id) => [id, id === "m1" ? leave : []] as const),
          ),
        ),
    },
    timeZone: () => Promise.resolve(IST),
  });
}

function closed(
  memberId: string,
  date: CalendarDate,
  from: string,
  to: string,
  approvalStatus: DayEntryRow["approvalStatus"] = "none",
): DayEntryRow {
  return {
    memberId,
    date,
    checkInAt: at(date, from),
    checkOutAt: at(date, to),
    approvalStatus,
  };
}

describe("recorded attendance days (CM-308)", () => {
  it("gives every date of the month per member from shifts, holidays, leave and entries", async () => {
    const days = await source(
      [
        closed("m1", "2026-10-01", "09:20", "19:30"),
        closed("m1", "2026-10-02", "10:00", "13:00"),
        closed("m1", "2026-10-05", "09:00", "17:00", "pending"),
        closed("m1", "2026-10-06", "09:00", "17:00", "approved"),
        closed("m2", "2026-10-01", "09:00", "11:00"),
      ],
      [
        {
          date: "2026-10-07",
          requestId: "r1",
          leaveTypeId: "cl",
          leaveTypeName: "Casual Leave",
          isPaid: true,
          session: "full",
          days: 1,
        },
      ],
    ).monthFor("company-1", ["m1", "m2"], "2026-10");

    const october = days.get("m1") ?? [];
    expect(october).toHaveLength(31);
    expect(october[0]).toEqual({
      date: "2026-10-01",
      status: "present",
      workedHours: 10.17,
      overtimeHours: 2.17,
      overtimeAllowed: true,
      shiftWorkingHours: 8,
      late: true,
      leave: null,
    });
    // A holiday worked keeps its status; the hours are overtime.
    expect(october[1]).toMatchObject({
      status: "holiday",
      workedHours: 3,
      overtimeHours: 3,
    });
    // Sunday 4 October is not a working day of the shift.
    expect(october[3]?.status).toBe("week_off");
    // Pending hours do not count yet.
    expect(october[4]?.status).toBe("absent");
    // An optional holiday is a working day.
    expect(october[5]?.status).toBe("present");
    expect(october[6]).toMatchObject({
      status: "on_leave",
      leave: { paid: true, half: false, otherHalf: null },
    });
    expect(days.get("m2")?.[0]?.status).toBe("absent");
  });

  it("answers a range across months and nothing for no members", async () => {
    const range = await source([]).daysBetween(
      "company-1",
      ["m1"],
      "2026-09-29",
      "2026-10-02",
    );
    expect(range.get("m1")?.map((day) => day.date)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect((await source([]).monthFor("company-1", [], "2026-10")).size).toBe(
      0,
    );
  });
});
