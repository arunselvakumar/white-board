import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  accruesHire,
  assertDayCap,
  daysInMonth,
  decideEquipmentSheet,
  DEFAULT_EQUIPMENT_SHEET_SETTINGS,
  defaultBillableMilli,
  defaultUnitRate,
  divideHalfUp,
  duplicateSheetOf,
  equipmentSheetContent,
  fuelOverrun,
  hireCost,
  meterGap,
  meterReading,
  savedApproval,
  scaledDecimal,
  sheetHire,
  sheetUsage,
  shiftCentiHours,
  shiftsOverlap,
  timeShift,
  timeShifts,
  type EquipmentSheetFacts,
  type EquipmentSheetInput,
  type EquipmentSheetSettings,
  type HireTerms,
  type SheetEquipmentFacts,
} from "./equipment-usage";

const AT = new Date("2026-10-11T05:00:00.000Z");
const BY = { userId: "user-1", at: AT };
const DAY = "2026-10-10";

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("did not throw");
}

const settings = (
  patch: Partial<EquipmentSheetSettings> = {},
): EquipmentSheetSettings => ({
  ...DEFAULT_EQUIPMENT_SHEET_SETTINGS,
  ...patch,
});

const owned = (
  patch: Partial<SheetEquipmentFacts> = {},
): SheetEquipmentFacts => ({
  id: "eq-1",
  ownership: "owned",
  utilisationBasis: "hourly",
  workingTimeMethod: "time_shifts",
  fuelUnit: "litre",
  expectedFuelEfficiency: "6.500",
  hire: null,
  ...patch,
});

const HOURLY: HireTerms = {
  hireBasis: "hourly",
  hireRate: 120_000n,
  idleChargeable: true,
};

const rented = (
  patch: Partial<SheetEquipmentFacts> = {},
): SheetEquipmentFacts =>
  owned({ ownership: "rented", hire: HOURLY, ...patch });

const facts = (
  equipment: SheetEquipmentFacts,
  patch: Partial<EquipmentSheetFacts> = {},
): EquipmentSheetFacts => ({
  equipment,
  financial: true,
  supervisor: null,
  contractor: null,
  department: null,
  unit: null,
  materials: new Map(),
  ...patch,
});

const input = (
  patch: Partial<EquipmentSheetInput> = {},
): EquipmentSheetInput => ({
  sheetDate: DAY,
  shift: "shift_1",
  timeShifts: [{ startTime: "08:00", endTime: "12:30" }],
  idleHours: "1",
  breakdownHours: "0",
  ...patch,
});

describe("time shifts", () => {
  it("computes minutes, crossing midnight", () => {
    expect(timeShift({ startTime: "08:00", endTime: "12:30" }).minutes).toBe(
      270,
    );
    expect(timeShift({ startTime: "22:00", endTime: "02:00" }).minutes).toBe(
      240,
    );
    expect(timeShift({ startTime: "23:59", endTime: "00:00" }).minutes).toBe(1);
  });

  it("refuses an equal start and end, and bad times", () => {
    expect(
      code(() => timeShift({ startTime: "08:00", endTime: "08:00" })),
    ).toBe("TIME_SHIFT_EMPTY");
    expect(code(() => timeShift({ startTime: "8:00", endTime: "09:00" }))).toBe(
      "TIME_SHIFT_INVALID",
    );
    expect(
      code(() => timeShift({ startTime: "08:00", endTime: "24:00" })),
    ).toBe("TIME_SHIFT_INVALID");
  });

  it("refuses overlaps, also across midnight; touching ends are fine", () => {
    expect(
      timeShifts([
        { startTime: "06:00", endTime: "10:00" },
        { startTime: "10:00", endTime: "14:00" },
      ]),
    ).toHaveLength(2);
    expect(
      code(() =>
        timeShifts([
          { startTime: "06:00", endTime: "10:00" },
          { startTime: "09:30", endTime: "11:00" },
        ]),
      ),
    ).toBe("TIME_SHIFTS_OVERLAP");
    const night = timeShift({ startTime: "22:00", endTime: "02:00" });
    expect(
      shiftsOverlap(night, timeShift({ startTime: "01:00", endTime: "03:00" })),
    ).toBe(true);
    expect(
      shiftsOverlap(night, timeShift({ startTime: "02:00", endTime: "06:00" })),
    ).toBe(false);
    expect(
      shiftsOverlap(night, timeShift({ startTime: "21:00", endTime: "23:00" })),
    ).toBe(true);
  });

  it("sums hours to two decimals, half-up", () => {
    expect(shiftCentiHours([{ minutes: 270 }])).toBe(450);
    expect(shiftCentiHours([{ minutes: 50 }])).toBe(83); // 0.8333
    expect(shiftCentiHours([{ minutes: 1 }])).toBe(2); // 0.01667
    expect(shiftCentiHours([{ minutes: 20 }, { minutes: 10 }])).toBe(50);
    expect(shiftCentiHours([{ minutes: 1440 }])).toBe(2400);
    expect(shiftCentiHours([])).toBe(0);
  });
});

describe("meter readings", () => {
  it("takes closing ≥ opening and reports the delta and the gap", () => {
    const meter = meterReading("1250.5", "1258.75");
    expect(meter).toEqual({ opening: 125050, closing: 125875, delta: 825 });
    expect(meterGap(meter.opening, 124800)).toBe(250);
    expect(meterGap(meter.opening, 125050)).toBe(0);
    expect(meterGap(meter.opening, null)).toBeNull();
    expect(meterReading("10", "10").delta).toBe(0);
  });

  it("refuses closing below opening, missing and bad readings", () => {
    expect(code(() => meterReading("100", "99.99"))).toBe(
      "METER_CLOSING_BELOW_OPENING",
    );
    expect(code(() => meterReading("", "10"))).toBe("METER_READING_REQUIRED");
    expect(code(() => meterReading("1.234", "10"))).toBe(
      "METER_READING_INVALID",
    );
  });
});

describe("usage by basis", () => {
  const shifts = timeShifts([
    { startTime: "08:00", endTime: "12:00" },
    { startTime: "13:00", endTime: "17:30" },
  ]);
  const meter = meterReading("500", "508");
  const base = {
    meterShown: true,
    shifts,
    meter,
    typedHours: null,
    typedDistance: null,
    trips: null,
  };

  it("hourly: shifts, the meter, or both with a mismatch", () => {
    expect(
      sheetUsage({ ...base, basis: "hourly", method: "time_shifts" })
        .usageHours,
    ).toBe(850);
    expect(
      sheetUsage({ ...base, basis: "hourly", method: "meter_reading" })
        .usageHours,
    ).toBe(800);
    const both = sheetUsage({ ...base, basis: "hourly", method: "both" });
    expect(both.usageHours).toBe(850);
    expect(both.meterMismatch).toEqual({ shiftHours: 850, meterHours: 800 });
    expect(
      sheetUsage({
        ...base,
        basis: "hourly",
        method: "meter_reading",
        meterShown: false,
        meter: null,
        typedHours: 650,
      }).usageHours,
    ).toBe(650);
  });

  it("km: the meter's delta or the typed distance; trip: the trips", () => {
    expect(
      sheetUsage({ ...base, basis: "km", method: "meter_reading" }).distanceKm,
    ).toBe(800);
    expect(
      sheetUsage({
        ...base,
        basis: "km",
        method: "time_shifts",
        typedDistance: 4250,
      }),
    ).toMatchObject({ distanceKm: 4250, usageHours: null, shiftHours: 850 });
    expect(
      sheetUsage({ ...base, basis: "trip", method: "time_shifts", trips: 14 }),
    ).toMatchObject({ trips: 14, usageHours: null });
  });
});

describe("the 24-hour cap", () => {
  it("counts usage (Hourly), idle and breakdown", () => {
    expect(() => {
      assertDayCap(2000, 300, 100);
    }).not.toThrow();
    expect(
      code(() => {
        assertDayCap(2000, 300, 101);
      }),
    ).toBe("SHEET_HOURS_OVER_24");
    expect(
      code(() => {
        assertDayCap(null, 2000, 401);
      }),
    ).toBe("SHEET_HOURS_OVER_24");
  });
});

describe("fuel overrun", () => {
  it("flags fuel ÷ usage above the efficiency, only with all three", () => {
    // 8 h at 6.5 L/h allows 52 L.
    expect(
      fuelOverrun({
        fuelMilli: 52_000,
        usageMilli: 8000,
        efficiencyMilli: 6500,
      }),
    ).toBe(false);
    expect(
      fuelOverrun({
        fuelMilli: 52_001,
        usageMilli: 8000,
        efficiencyMilli: 6500,
      }),
    ).toBe(true);
    expect(
      fuelOverrun({ fuelMilli: 10_000, usageMilli: 0, efficiencyMilli: 6500 }),
    ).toBe(false);
    expect(
      fuelOverrun({ fuelMilli: null, usageMilli: 8000, efficiencyMilli: 6500 }),
    ).toBe(false);
    expect(
      fuelOverrun({
        fuelMilli: 99_000,
        usageMilli: 8000,
        efficiencyMilli: null,
      }),
    ).toBe(false);
  });
});

describe("hire cost", () => {
  it("hourly: usage plus chargeable idle at the hire rate", () => {
    const worked = { hours: 750, idleHours: 125, trips: 0 };
    expect(defaultBillableMilli(HOURLY, worked)).toBe(8750n);
    // ₹1,200.00 × 8.75 h = ₹10,500.00
    expect(
      sheetHire(HOURLY, DAY, worked, { unitRate: null, billableMilli: null }),
    ).toEqual({
      unitRate: 120_000n,
      billableMilli: 8750n,
      hireCost: 1_050_000n,
    });
    const notChargeable = { ...HOURLY, idleChargeable: false };
    expect(defaultBillableMilli(notChargeable, worked)).toBe(7500n);
  });

  it("daily: one day at the rate", () => {
    const daily: HireTerms = {
      hireBasis: "daily",
      hireRate: 850_000n,
      idleChargeable: false,
    };
    expect(
      sheetHire(
        daily,
        DAY,
        { hours: 0, idleHours: 0, trips: 0 },
        {
          unitRate: null,
          billableMilli: null,
        },
      ),
    ).toEqual({ unitRate: 850_000n, billableMilli: 1000n, hireCost: 850_000n });
  });

  it("monthly: a day's share of the rate in a 30- and a 31-day month", () => {
    const monthly: HireTerms = {
      hireBasis: "monthly",
      hireRate: 15_000_000n, // ₹1,50,000 a month
      idleChargeable: false,
    };
    expect(daysInMonth("2026-09-14")).toBe(30);
    expect(daysInMonth("2026-10-14")).toBe(31);
    expect(daysInMonth("2028-02-01")).toBe(29);
    // 15,000,000 ÷ 30 = 500,000 exactly.
    expect(defaultUnitRate(monthly, "2026-09-14")).toBe(500_000n);
    // 15,000,000 ÷ 31 = 483,870.97 → 483,871 (half-up).
    expect(defaultUnitRate(monthly, "2026-10-14")).toBe(483_871n);
    expect(
      sheetHire(
        monthly,
        "2026-10-14",
        { hours: 0, idleHours: 0, trips: 0 },
        {
          unitRate: null,
          billableMilli: null,
        },
      ).hireCost,
    ).toBe(483_871n);
  });

  it("trip: the trips at the rate", () => {
    const trip: HireTerms = {
      hireBasis: "trip",
      hireRate: 75_050n,
      idleChargeable: false,
    };
    expect(
      sheetHire(
        trip,
        DAY,
        { hours: 0, idleHours: 0, trips: 12 },
        {
          unitRate: null,
          billableMilli: null,
        },
      ),
    ).toEqual({
      unitRate: 75_050n,
      billableMilli: 12_000n,
      hireCost: 900_600n,
    });
  });

  it("rounds half-up in paise, and takes overrides", () => {
    // 333 paise × 1.5 = 499.5 → 500
    expect(hireCost(333n, 1500n)).toBe(500n);
    // 333 × 1.499 = 499.167 → 499
    expect(hireCost(333n, 1499n)).toBe(499n);
    expect(divideHalfUp(5n, 2n)).toBe(3n);
    expect(divideHalfUp(4n, 3n)).toBe(1n);
    expect(
      sheetHire(
        HOURLY,
        DAY,
        { hours: 750, idleHours: 0, trips: 0 },
        {
          unitRate: 100_000n,
          billableMilli: 8000n,
        },
      ).hireCost,
    ).toBe(800_000n);
  });
});

describe("scaled decimals", () => {
  it("reads at the column's scale", () => {
    const shape = { digits: 2, scale: 2 };
    expect(scaledDecimal("8.5", shape, "X", {})).toBe(850);
    expect(scaledDecimal("0.05", shape, "X", {})).toBe(5);
    expect(scaledDecimal(" ", shape, "X", {})).toBeNull();
    expect(code(() => scaledDecimal("1.234", shape, "X", {}))).toBe("X");
    expect(code(() => scaledDecimal("-1", shape, "X", {}))).toBe("X");
  });
});

describe("sheet content", () => {
  it("owned hourly with shifts: usage, idle, no hire", () => {
    const { content, usage } = equipmentSheetContent(
      input({ fuelQty: "30", fuelBorneBy: null }),
      settings(),
      facts(owned()),
    );
    expect(usage.usageHours).toBe(450);
    expect(content).toMatchObject({
      usageHours: "4.50",
      distanceKm: null,
      idleHours: "1.00",
      breakdownHours: "0.00",
      fuelQty: "30.000",
      fuelBorneBy: "company",
      // 30 L ÷ 4.5 h = 6.67 > 6.5
      fuelOverrun: true,
      unitRate: null,
      hireCost: null,
    });
  });

  it("rented hourly by meter: hire cost from the defaults", () => {
    const { content } = equipmentSheetContent(
      input({
        timeShifts: [],
        openingReading: "1200",
        closingReading: "1207.5",
        idleHours: "0.5",
        fuelQty: "20",
        fuelBorneBy: "hire_party",
      }),
      settings(),
      facts(rented({ workingTimeMethod: "meter_reading" }), {
        financial: false,
      }),
    );
    expect(content).toMatchObject({
      openingReading: "1200.00",
      closingReading: "1207.50",
      usageHours: "7.50",
      unitRate: 120_000n,
      billableQty: "8.000",
      hireCost: 960_000n,
      fuelBorneBy: "hire_party",
      fuelOverrun: false,
    });
  });

  it("refuses a rate or billable override without Financial (403)", () => {
    const error = (() => {
      try {
        equipmentSheetContent(
          input({ unitRate: 100_000 }),
          settings(),
          facts(rented(), { financial: false }),
        );
      } catch (caught) {
        return caught as DomainError;
      }
      return null;
    })();
    expect(error?.code).toBe("PERMISSION_DENIED");
    expect(error?.kind).toBe("forbidden");
  });

  it("keeps an earlier override when a member without Financial edits", () => {
    const first = equipmentSheetContent(
      input({ billableQty: "9" }),
      settings(),
      facts(rented()),
    ).content;
    expect(first.billableQty).toBe("9.000");
    const edited = equipmentSheetContent(
      input({ remark: "Bucket teeth changed" }),
      settings(),
      facts(rented(), { financial: false }),
      first,
    ).content;
    expect(edited).toMatchObject({
      billableQty: "9.000",
      hireCost: 1_080_000n,
    });
    // A default stays a default: hours change, the quantity follows.
    const plain = equipmentSheetContent(
      input(),
      settings(),
      facts(rented()),
    ).content;
    const longer = equipmentSheetContent(
      input({ timeShifts: [{ startTime: "08:00", endTime: "14:00" }] }),
      settings(),
      facts(rented(), { financial: false }),
      plain,
    ).content;
    expect(longer.billableQty).toBe("7.000");
  });

  it("km and trip bases; the cap; hidden fields are not validated", () => {
    expect(
      equipmentSheetContent(
        input({ distanceKm: "86.4" }),
        settings(),
        facts(owned({ utilisationBasis: "km" })),
      ).content,
    ).toMatchObject({ distanceKm: "86.40", usageHours: null });
    expect(
      code(() =>
        equipmentSheetContent(
          input(),
          settings(),
          facts(owned({ utilisationBasis: "km" })),
        ),
      ),
    ).toBe("DISTANCE_REQUIRED");
    expect(
      equipmentSheetContent(
        input({ trips: 14 }),
        settings(),
        facts(owned({ utilisationBasis: "trip" })),
      ).content.trips,
    ).toBe(14);
    expect(
      code(() =>
        equipmentSheetContent(
          input({
            timeShifts: [{ startTime: "00:00", endTime: "20:00" }],
            idleHours: "3",
            breakdownHours: "1.5",
          }),
          settings(),
          facts(owned()),
        ),
      ),
    ).toBe("SHEET_HOURS_OVER_24");
    // Breakdown hidden: not read, so not counted.
    expect(
      equipmentSheetContent(
        input({
          timeShifts: [{ startTime: "00:00", endTime: "20:00" }],
          idleHours: "3",
          breakdownHours: "1.5",
        }),
        settings({ showBreakdownHours: false, showOperator: false }),
        facts(owned()),
      ).content.breakdownHours,
    ).toBe("0.00");
  });

  it("hours typed when the meter is hidden on a meter machine", () => {
    expect(
      equipmentSheetContent(
        input({ usageHours: "6.25", openingReading: "1", closingReading: "0" }),
        settings({ showMeterReadings: false }),
        facts(owned({ workingTimeMethod: "meter_reading" })),
      ).content,
    ).toMatchObject({ usageHours: "6.25", openingReading: null });
  });
});

describe("approval", () => {
  it("works like worksheets, with this document's codes", () => {
    expect(savedApproval(false, true, BY).status).toBe("not_required");
    const pending = savedApproval(true, false, BY);
    expect(decideEquipmentSheet(pending, { approve: true }, BY).status).toBe(
      "approved",
    );
    expect(
      code(() =>
        decideEquipmentSheet(
          savedApproval(false, false, BY),
          { approve: true },
          BY,
        ),
      ),
    ).toBe("EQUIPMENT_SHEET_NOT_PENDING");
    expect(accruesHire("rented", "not_required")).toBe(true);
    expect(accruesHire("rented", "pending")).toBe(false);
    expect(accruesHire("owned", "approved")).toBe(false);
  });
});

describe("duplicate", () => {
  it("copies all but readings; opening becomes the last closing", () => {
    const { content } = equipmentSheetContent(
      input({
        timeShifts: [],
        openingReading: "100",
        closingReading: "108",
        operatorName: "Ramesh",
      }),
      settings(),
      facts(owned({ workingTimeMethod: "meter_reading" })),
    );
    expect(duplicateSheetOf(content, "2026-10-11", "108.00")).toMatchObject({
      sheetDate: "2026-10-11",
      openingReading: "108.00",
      closingReading: null,
      operatorName: "Ramesh",
    });
  });
});
