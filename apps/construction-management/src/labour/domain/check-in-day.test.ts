import { describe, expect, it } from "vitest";

import { createdDayMark, timesDayMark } from "./check-in-day";
import { priceDay, type PricedDay, type WageCard } from "./labour-attendance";

const CARD: WageCard = {
  wageType: "daily",
  wagePerDay: 70_000,
  wagePerMonth: null,
  overtimeWagePerHour: 10_000,
  workingHours: "8",
};

function price(mark: ReturnType<typeof createdDayMark>): PricedDay {
  return priceDay({ mark, card: CARD, projectId: "p1", date: "2026-11-14" });
}

describe("createdDayMark", () => {
  it("is Present with the times and one overtime line from them", () => {
    const day = price(
      createdDayMark({
        labourId: "l1",
        times: { checkIn: "08:00", checkOut: "18:30", breakMinutes: 60 },
        labourCategoryId: "mason",
      }),
    );
    expect(day).toMatchObject({
      status: "present",
      checkIn: "08:00",
      checkOut: "18:30",
      breakMinutes: 60,
      earned: 70_000,
    });
    // 10.5 h − 1 h break − 8 h = 1.5 h.
    expect(day.overtime).toEqual([
      {
        labourCategoryId: "mason",
        hours: "1.5",
        ratePerHour: 10_000,
        amount: 15_000,
        fromTimes: true,
      },
    ]);
  });

  it("has no overtime while the Labour is in", () => {
    const day = price(
      createdDayMark({
        labourId: "l1",
        times: { checkIn: "08:00", checkOut: null, breakMinutes: 60 },
        labourCategoryId: null,
      }),
    );
    expect(day.checkOut).toBeNull();
    expect(day.overtime).toEqual([]);
  });
});

describe("timesDayMark", () => {
  const stored = {
    labourId: "l1",
    status: "half_day" as const,
    isPaidLeave: false,
    shift: "Night",
  };

  it("keeps status and shift, and adds the line from the times to a day without overtime", () => {
    const mark = timesDayMark({
      day: { ...stored, overtime: [] },
      times: { checkIn: "08:00", checkOut: "19:00", breakMinutes: 60 },
      labourCategoryId: "mason",
    });
    expect(mark).toMatchObject({
      status: "half_day",
      shift: "Night",
      checkIn: "08:00",
      checkOut: "19:00",
      breakMinutes: 60,
      overtime: [{ labourCategoryId: "mason", fromTimes: true }],
    });
    expect(price(mark).overtime[0]?.hours).toBe("2");
  });

  it("keeps the line from the times with its rate and lets its hours follow", () => {
    const mark = timesDayMark({
      day: {
        ...stored,
        overtime: [
          {
            labourCategoryId: "helper",
            hours: "1",
            ratePerHour: 12_500,
            amount: 12_500,
            fromTimes: true,
          },
        ],
      },
      times: { checkIn: "08:00", checkOut: "20:00", breakMinutes: 60 },
      labourCategoryId: "mason",
    });
    expect(price(mark).overtime).toEqual([
      {
        labourCategoryId: "helper",
        hours: "3",
        ratePerHour: 12_500,
        amount: 37_500,
        fromTimes: true,
      },
    ]);
  });

  it("keeps typed overtime exactly and adds no line from the times", () => {
    const typed = {
      labourCategoryId: "mason",
      hours: "2.5",
      ratePerHour: 11_000,
      amount: 27_500,
      fromTimes: false,
    };
    const mark = timesDayMark({
      day: { ...stored, overtime: [typed] },
      times: { checkIn: "08:00", checkOut: "21:00", breakMinutes: 30 },
      labourCategoryId: "mason",
    });
    expect(price(mark).overtime).toEqual([typed]);
  });

  it("removes the times, and the line from them, when the log has none left", () => {
    const mark = timesDayMark({
      day: {
        ...stored,
        overtime: [
          {
            labourCategoryId: "mason",
            hours: "1",
            ratePerHour: 10_000,
            amount: 10_000,
            fromTimes: true,
          },
        ],
      },
      times: null,
      labourCategoryId: "mason",
    });
    const day = price(mark);
    expect(day).toMatchObject({
      checkIn: null,
      checkOut: null,
      breakMinutes: null,
    });
    expect(day.overtime).toEqual([]);
  });
});
