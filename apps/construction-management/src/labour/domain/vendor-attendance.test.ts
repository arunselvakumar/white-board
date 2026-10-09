import { describe, expect, it } from "vitest";

import {
  priceVendorDay,
  vendorDayLedgerEntries,
  type RateCard,
} from "./vendor-attendance";

const card: RateCard = new Map([
  [
    "s1",
    {
      name: "Shift 1",
      rates: new Map([
        ["mason", { ratePerDay: 90_000, overtimePerHour: 12_000 }],
        ["helper", { ratePerDay: 60_000, overtimePerHour: 8_000 }],
      ]),
    },
  ],
]);

function price(lines: Parameters<typeof priceVendorDay>[0]["lines"]) {
  return priceVendorDay({
    vendorId: "v1",
    projectId: "p1",
    date: "2026-10-05",
    lines,
    card,
  });
}

describe("priceVendorDay", () => {
  it("prices each line from the rate card and snapshots it", () => {
    const day = price([
      {
        shiftId: "s1",
        labourCategoryId: "mason",
        fullDayCount: 4,
        halfDayCount: 1,
        overtimeHours: "3",
      },
      {
        shiftId: "s1",
        labourCategoryId: "helper",
        fullDayCount: 6,
        halfDayCount: 0,
      },
    ]);
    expect(day.lines[0]).toMatchObject({
      shiftName: "Shift 1",
      ratePerDay: 90_000,
      amount: 4 * 90_000 + 45_000 + 36_000,
    });
    expect(day.totalPay).toBe(4 * 90_000 + 45_000 + 36_000 + 6 * 60_000);
    expect(vendorDayLedgerEntries(day, "va1")).toEqual([
      expect.objectContaining({
        partyType: "vendor",
        kind: "earned",
        amount: day.totalPay,
        sourceType: "vendor_attendance",
      }),
    ]);
  });

  it("refuses a day whose pay does not fit an integer of paise", () => {
    const dear: RateCard = new Map([
      [
        "s1",
        {
          name: "Shift 1",
          rates: new Map([
            ["mason", { ratePerDay: 2_000_000_000, overtimePerHour: 0 }],
          ]),
        },
      ],
    ]);
    expect(() =>
      priceVendorDay({
        vendorId: "v1",
        projectId: "p1",
        date: "2026-10-05",
        card: dear,
        lines: [
          {
            shiftId: "s1",
            labourCategoryId: "mason",
            fullDayCount: 2,
            halfDayCount: 0,
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: "AMOUNT_TOO_LARGE" }));
  });

  it("refuses categories off the card, duplicates, empty and negative lines", () => {
    const line = {
      shiftId: "s1",
      labourCategoryId: "mason",
      fullDayCount: 1,
      halfDayCount: 0,
    };
    expect(() => price([{ ...line, labourCategoryId: "welder" }])).toThrow(
      expect.objectContaining({ code: "CATEGORY_NOT_ON_SHIFT" }),
    );
    expect(() => price([{ ...line, shiftId: "s9" }])).toThrow(
      expect.objectContaining({ code: "SHIFT_NOT_FOUND" }),
    );
    expect(() => price([line, line])).toThrow(
      expect.objectContaining({ code: "DUPLICATE_SHIFT_CATEGORY" }),
    );
    expect(() => price([{ ...line, fullDayCount: 0 }])).toThrow(
      expect.objectContaining({ code: "LINE_EMPTY" }),
    );
    expect(() => price([{ ...line, halfDayCount: -1 }])).toThrow(
      expect.objectContaining({ code: "HEADCOUNT_INVALID" }),
    );
    expect(() => price([{ ...line, overtimeHours: "1.234" }])).toThrow(
      expect.objectContaining({ code: "OVERTIME_HOURS_INVALID" }),
    );
    expect(() => price([])).toThrow(
      expect.objectContaining({ code: "ATTENDANCE_EMPTY" }),
    );
  });
});
