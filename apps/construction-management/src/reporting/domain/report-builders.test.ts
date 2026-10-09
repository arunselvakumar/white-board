import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { buildLabourAttendanceReport } from "./labour-attendance-report";
import type { ReportLabour, ReportLabourDay } from "./labour-days";
import { buildMonthWiseLabourReport } from "./labour-month-report";
import { buildLabourPaymentReport } from "./labour-payment-report";
import { paymentFigures, type ReportLedgerEntry } from "./ledger-summary";
import { buildMusterRoll } from "./muster-roll";
import type { ReportTable } from "./report-document";
import {
  checkReportParams,
  checkReportScope,
  failureMessage,
  reportFileName,
} from "./report-job";
import { datesIn, monthRange, rangeLabel } from "./report-period";
import { buildVendorAttendanceReport } from "./vendor-attendance-report";

const RAJU: ReportLabour = {
  id: "raju",
  name: "Raju Pawar",
  labourCode: "L-1",
  fatherName: "Shankar Pawar",
  category: "Mason",
  gender: "male",
  wageType: "daily",
  wageRate: 80_000,
};
const ASHA: ReportLabour = {
  id: "asha",
  name: "Asha Kale",
  labourCode: null,
  fatherName: null,
  category: "Helper",
  gender: "female",
  wageType: "monthly",
  wageRate: 1_550_000,
};
const IDLE: ReportLabour = { ...RAJU, id: "idle", name: "Zed Idle" };

function day(
  labourId: string,
  date: string,
  overrides: Partial<ReportLabourDay> = {},
): ReportLabourDay {
  return {
    labourId,
    date,
    status: "present",
    isPaidLeave: false,
    shift: null,
    supervisor: null,
    overtimeHundredths: 0,
    wageType: "daily",
    wageRate: 80_000,
    earned: 80_000,
    overtimeAmount: 0,
    ...overrides,
  };
}

/**
 * August 2026 has 31 days. Raju (daily ₹800): present every weekday 1–31
 * except: half day on the 3rd, absent on the 4th, leave on the 5th, paid
 * leave on the 6th, holiday on the 7th; 2.5 OT hours on the 10th and 1.25
 * on the 31st at ₹100/h. Asha (monthly ₹15,500 → ₹500 a day): present on
 * the 1st, holiday on the 2nd, half day on the 31st.
 */
function august(): ReportLabourDay[] {
  const days: ReportLabourDay[] = [];
  for (const date of datesIn(monthRange("2026-08"))) {
    const n = Number(date.slice(8));
    if (n === 3)
      days.push(day("raju", date, { status: "half_day", earned: 40_000 }));
    else if (n === 4)
      days.push(day("raju", date, { status: "absent", earned: 0 }));
    else if (n === 5)
      days.push(day("raju", date, { status: "on_leave", earned: 0 }));
    else if (n === 6)
      days.push(day("raju", date, { status: "on_leave", isPaidLeave: true }));
    else if (n === 7)
      days.push(day("raju", date, { status: "holiday", earned: 0 }));
    else if (n === 10)
      days.push(
        day("raju", date, { overtimeHundredths: 250, overtimeAmount: 25_000 }),
      );
    else if (n === 31)
      days.push(
        day("raju", date, {
          overtimeHundredths: 125,
          overtimeAmount: 12_500,
          supervisor: "Mohan",
          shift: "Shift 1",
        }),
      );
    else days.push(day("raju", date));
  }
  const monthly = { wageType: "monthly" as const, wageRate: 1_550_000 };
  days.push(
    day("asha", "2026-08-01", { ...monthly, earned: 50_000 }),
    day("asha", "2026-08-02", {
      ...monthly,
      status: "holiday",
      earned: 50_000,
    }),
    day("asha", "2026-08-31", {
      ...monthly,
      status: "half_day",
      earned: 25_000,
    }),
  );
  return days;
}

// Raju: 31 days − 5 special = 26 present days at ₹800 + half ₹400 + PL ₹800.
const RAJU_EARNED = 26 * 80_000 + 40_000 + 80_000;
const ASHA_EARNED = 125_000;

function rowOf(table: ReportTable | undefined, name: string) {
  const row = table?.rows.find((cells) => cells.includes(name));
  if (row == null) throw new Error(`No row for ${name}`);
  const labels = table?.columns.map((col) => col.label) ?? [];
  return (label: string) => row[labels.indexOf(label)];
}

function totalOf(table: ReportTable | undefined, label: string) {
  const index = table?.columns.findIndex((col) => col.label === label) ?? -1;
  return table?.totals?.[index];
}

describe("All Labour Attendance", () => {
  const range = { from: "2026-08-01", to: "2026-08-31" };

  it("counts each status per Labour over a 31-day month, with OT hours and totals", () => {
    const report = buildLabourAttendanceReport({
      range,
      labours: [RAJU, ASHA, IDLE],
      days: august(),
    });
    const [summary, byDay] = report.tables;
    // Only Labours marked in the period, by name.
    expect(summary?.rows.map((row) => row[1])).toEqual([
      "Asha Kale",
      "Raju Pawar",
    ]);
    const raju = rowOf(summary, "Raju Pawar");
    expect(raju("Present")).toBe(26);
    expect(raju("Half day")).toBe(1);
    expect(raju("Absent")).toBe(1);
    expect(raju("Leave")).toBe(1);
    expect(raju("Paid leave")).toBe(1);
    expect(raju("Holiday")).toBe(1);
    expect(raju("OT hours")).toBe(3.75);
    expect(totalOf(summary, "Present")).toBe(27);
    expect(totalOf(summary, "Half day")).toBe(2);
    expect(totalOf(summary, "Holiday")).toBe(2);
    expect(totalOf(summary, "OT hours")).toBe(3.75);
    expect(summary?.totals?.[1]).toBe("Total");

    expect(byDay?.rows).toHaveLength(31 + 3);
    expect(byDay?.rows[0]).toEqual([
      "01 Aug 2026",
      "Asha Kale",
      null,
      "Present",
      null,
      null,
      0,
    ]);
    expect(byDay?.rows.at(-1)).toEqual([
      "31 Aug 2026",
      "Raju Pawar",
      "L-1",
      "Present",
      "Shift 1",
      "Mohan",
      1.25,
    ]);
    expect(totalOf(byDay, "OT hours")).toBe(3.75);
  });

  it("leaves out days outside the range", () => {
    const report = buildLabourAttendanceReport({
      range: { from: "2026-08-01", to: "2026-08-02" },
      labours: [RAJU, ASHA],
      days: august(),
    });
    expect(rowOf(report.tables[0], "Raju Pawar")("Present")).toBe(2);
    expect(report.tables[1]?.rows).toHaveLength(4);
  });
});

describe("Month-wise Labour", () => {
  it("lays out Labour × 31 days with marks, counts and earnings", () => {
    const report = buildMonthWiseLabourReport({
      month: "2026-08",
      labours: [RAJU, ASHA],
      days: august(),
      financial: true,
    });
    const [table] = report.tables;
    const labels = table?.columns.map((col) => col.label) ?? [];
    expect(labels.slice(2, 33)).toEqual(
      Array.from({ length: 31 }, (_, index) => String(index + 1)),
    );
    expect(labels.slice(33)).toEqual([
      "P",
      "½",
      "A",
      "L",
      "PL",
      "H",
      "OT hrs",
      "Earned",
      "OT amount",
      "Total",
    ]);
    const raju = rowOf(table, "Raju Pawar");
    expect(["1", "3", "4", "5", "6", "7"].map(raju)).toEqual([
      "P",
      "½",
      "A",
      "L",
      "PL",
      "H",
    ]);
    expect(raju("OT hrs")).toBe(3.75);
    expect(raju("Earned")).toBe(RAJU_EARNED);
    expect(raju("OT amount")).toBe(37_500);
    expect(raju("Total")).toBe(RAJU_EARNED + 37_500);
    const asha = rowOf(table, "Asha Kale");
    expect(asha("2")).toBe("H");
    expect(asha("15")).toBeNull();
    // Day totals count Labours at work; the 31st has Raju P and Asha ½.
    expect(totalOf(table, "31")).toBe("2");
    expect(totalOf(table, "4")).toBeNull();
    expect(totalOf(table, "Earned")).toBe(RAJU_EARNED + ASHA_EARNED);
  });

  it("leaves the money columns out without Financial", () => {
    const report = buildMonthWiseLabourReport({
      month: "2026-08",
      labours: [RAJU],
      days: august(),
      financial: false,
    });
    const labels = report.tables[0]?.columns.map((col) => col.label);
    expect(labels).not.toContain("Earned");
    expect(labels?.at(-1)).toBe("OT hrs");
    expect(report.notes.join(" ")).toContain("Financial");
  });

  it("handles a 30-day and a February month", () => {
    for (const [month, days] of [
      ["2026-09", 30],
      ["2026-02", 28],
      ["2028-02", 29],
    ] as const) {
      const report = buildMonthWiseLabourReport({
        month,
        labours: [],
        days: [],
        financial: false,
      });
      expect(report.tables[0]?.columns).toHaveLength(2 + days + 7);
    }
  });
});

describe("All Labour Payment (ADR CM-0004 mapping)", () => {
  const range = { from: "2026-08-01", to: "2026-08-31" };
  const entry = (
    partyId: string,
    kind: ReportLedgerEntry["kind"],
    amount: number,
    entryDate: string,
  ): ReportLedgerEntry => ({ partyId, kind, amount, entryDate });

  const entries: ReportLedgerEntry[] = [
    // Before the period: opening ₹1,000 owed, a July day, a July payment.
    entry("raju", "opening", 100_000, "2026-06-01"),
    entry("raju", "earned", 80_000, "2026-07-31"),
    entry("raju", "payment", -50_000, "2026-07-31"),
    // In the period.
    entry("raju", "earned", 80_000, "2026-08-01"),
    entry("raju", "earned", 80_000, "2026-08-02"),
    entry("raju", "overtime", 25_000, "2026-08-02"),
    // The 2nd re-marked as a half day: reversal (same kind), then ₹400.
    entry("raju", "earned", -80_000, "2026-08-02"),
    entry("raju", "earned", 40_000, "2026-08-02"),
    entry("raju", "advance", -30_000, "2026-08-10"),
    entry("raju", "payment", -60_000, "2026-08-20"),
    // A cancelled payment nets out.
    entry("raju", "payment", -10_000, "2026-08-21"),
    entry("raju", "payment", 10_000, "2026-08-21"),
    // After the period: ignored.
    entry("raju", "earned", 80_000, "2026-09-01"),
    // Asha joins in the period with an advance given before the app
    // (opening dated inside the period counts as Previous Balance).
    entry("asha", "opening", -20_000, "2026-08-15"),
    entry("asha", "earned", 50_000, "2026-08-16"),
  ];

  it("maps entries to Previous Balance, To Pay, Advance, Paid and Final Amount", () => {
    expect(
      paymentFigures(
        entries.filter((e) => e.partyId === "raju"),
        range,
      ),
    ).toEqual({
      previousBalance: 130_000,
      earned: 120_000,
      overtime: 25_000,
      toPay: 145_000,
      advance: 30_000,
      paid: 60_000,
      finalAmount: 185_000,
    });
    expect(
      paymentFigures(
        entries.filter((e) => e.partyId === "asha"),
        range,
      ),
    ).toEqual({
      previousBalance: -20_000,
      earned: 50_000,
      overtime: 0,
      toPay: 50_000,
      advance: 0,
      paid: 0,
      finalAmount: 30_000,
    });
  });

  it("an opening reversal inside the period moves Previous Balance", () => {
    const figures = paymentFigures(
      [
        entry("x", "opening", 100_000, "2026-06-01"),
        entry("x", "opening", -100_000, "2026-08-05"),
        entry("x", "opening", 70_000, "2026-08-05"),
      ],
      range,
    );
    expect(figures.previousBalance).toBe(70_000);
    expect(figures.finalAmount).toBe(70_000);
  });

  it("builds one row per Labour with totals, zero for a Labour with no entries", () => {
    const report = buildLabourPaymentReport({
      range,
      labours: [RAJU, ASHA, IDLE],
      entries,
    });
    const [table] = report.tables;
    expect(table?.rows.map((row) => row[1])).toEqual([
      "Asha Kale",
      "Raju Pawar",
      "Zed Idle",
    ]);
    expect(rowOf(table, "Raju Pawar")("Final Amount")).toBe(185_000);
    expect(rowOf(table, "Zed Idle")("Previous Balance")).toBe(0);
    expect(totalOf(table, "Previous Balance")).toBe(110_000);
    expect(totalOf(table, "To Pay")).toBe(195_000);
    expect(totalOf(table, "Advance")).toBe(30_000);
    expect(totalOf(table, "Paid")).toBe(60_000);
    expect(totalOf(table, "Final Amount")).toBe(215_000);
  });
});

describe("Vendor Attendance", () => {
  const lines = [
    {
      date: "2026-08-02",
      projectName: "Tower A",
      vendorName: "Ramesh Gang",
      shiftName: "Shift 1",
      category: "Mason",
      fullDayCount: 3,
      halfDayCount: 1,
      overtimeHundredths: 0,
      ratePerDay: 90_000,
      overtimePerHour: 12_000,
      amount: 315_000,
    },
    {
      date: "2026-08-01",
      projectName: "Villa",
      vendorName: "Suresh",
      shiftName: "Shift 1",
      category: "Helper",
      fullDayCount: 2,
      halfDayCount: 0,
      overtimeHundredths: 150,
      ratePerDay: 55_050,
      overtimePerHour: 7_000,
      amount: 120_600,
    },
  ];

  it("lists lines by date with totals; rates are not totalled", () => {
    const report = buildVendorAttendanceReport({
      lines,
      financial: true,
      central: false,
      filters: { vendor: null, category: null },
    });
    const [table] = report.tables;
    expect(table?.columns.map((col) => col.label)).toEqual([
      "Date",
      "Vendor",
      "Shift",
      "Category",
      "Full day",
      "Half day",
      "OT hours",
      "Rate/day",
      "OT rate/hr",
      "Pay",
    ]);
    expect(table?.rows[0]?.[0]).toBe("01 Aug 2026");
    expect(table?.totals).toEqual([
      "Total",
      null,
      null,
      null,
      5,
      1,
      1.5,
      null,
      null,
      435_600,
    ]);
    expect(report.title).toBe("Vendor Attendance Report");
  });

  it("adds a Project column centrally and drops pay without Financial", () => {
    const report = buildVendorAttendanceReport({
      lines,
      financial: false,
      central: true,
      filters: { vendor: "Ramesh Gang", category: null },
    });
    const labels = report.tables[0]?.columns.map((col) => col.label);
    expect(labels?.[1]).toBe("Project");
    expect(labels).not.toContain("Pay");
    expect(report.title).toBe("Central Vendor Attendance Report");
    expect(report.notes[0]).toBe("Vendor: Ramesh Gang");
  });
});

describe("Muster roll (combined register)", () => {
  it("has the combined register columns and computes days, wages and net", () => {
    const report = buildMusterRoll({
      month: "2026-08",
      labours: [RAJU, ASHA, IDLE],
      days: august(),
      entries: [
        {
          partyId: "raju",
          kind: "advance",
          amount: -30_000,
          entryDate: "2026-08-10",
        },
        {
          partyId: "raju",
          kind: "payment",
          amount: -60_000,
          entryDate: "2026-08-20",
        },
        {
          partyId: "raju",
          kind: "payment",
          amount: -5_000,
          entryDate: "2026-07-31",
        },
      ],
    });
    const [table] = report.tables;
    const labels = table?.columns.map((col) => col.label) ?? [];
    expect(labels.slice(0, 5)).toEqual([
      "Sl. No.",
      "Name",
      "Father's name",
      "Category",
      "Sex",
    ]);
    expect(labels.slice(5, 36)).toHaveLength(31);
    expect(labels.slice(36)).toEqual([
      "Days worked",
      "Paid days",
      "Wage type",
      "Wage rate",
      "Basic earned",
      "OT hours",
      "OT amount",
      "Gross",
      "Advance",
      "Deductions",
      "Net payable",
      "Paid in month",
      "Signature / thumb impression",
    ]);

    const raju = rowOf(table, "Raju Pawar");
    expect(raju("Father's name")).toBe("Shankar Pawar");
    expect(raju("Sex")).toBe("M");
    expect(raju("10")).toBe("P+2.5");
    expect(raju("31")).toBe("P+1.25");
    expect(raju("3")).toBe("½");
    expect(raju("Days worked")).toBe(26.5);
    // Present 26 + half 0.5 + paid leave 1; the holiday is unpaid on a daily wage.
    expect(raju("Paid days")).toBe(27.5);
    expect(raju("Wage type")).toBe("Per day");
    expect(raju("Wage rate")).toBe(80_000);
    expect(raju("Basic earned")).toBe(RAJU_EARNED);
    expect(raju("OT amount")).toBe(37_500);
    expect(raju("Gross")).toBe(RAJU_EARNED + 37_500);
    expect(raju("Advance")).toBe(30_000);
    expect(raju("Deductions")).toBe(0);
    expect(raju("Net payable")).toBe(RAJU_EARNED + 37_500 - 30_000);
    expect(raju("Paid in month")).toBe(60_000);
    expect(raju("Signature / thumb impression")).toBeNull();

    const asha = rowOf(table, "Asha Kale");
    // A holiday is paid on a monthly wage.
    expect(asha("Days worked")).toBe(1.5);
    expect(asha("Paid days")).toBe(2.5);
    expect(asha("Wage type")).toBe("Per month");
    expect(asha("Sex")).toBe("F");

    // On the Project but not marked: a blank row at the current wage.
    const idle = rowOf(table, "Zed Idle");
    expect(idle("1")).toBeNull();
    expect(idle("Gross")).toBe(0);
    expect(idle("Wage rate")).toBe(80_000);

    expect(totalOf(table, "Gross")).toBe(RAJU_EARNED + 37_500 + ASHA_EARNED);
    expect(totalOf(table, "Wage rate")).toBeNull();
    expect(totalOf(table, "Days worked")).toBe(28);
    expect(totalOf(table, "1")).toBe("2");
    expect(report.notes.join(" ")).toContain("Vendor headcount is not named");
  });
});

describe("report requests", () => {
  it("checks periods and scope", () => {
    expect(() =>
      checkReportParams({
        kind: "labour_attendance",
        from: "2026-08-02",
        to: "2026-08-01",
      }),
    ).toThrow(DomainError);
    expect(() =>
      checkReportParams({
        kind: "labour_payment",
        from: "2025-01-01",
        to: "2026-01-02",
      }),
    ).toThrow("at most 366 days");
    expect(() =>
      checkReportParams({ kind: "muster_roll", month: "2026-13" }),
    ).toThrow(DomainError);
    expect(() => {
      checkReportScope("muster_roll", null);
    }).toThrow(DomainError);
    expect(() => {
      checkReportScope("vendor_attendance", null);
    }).not.toThrow();
  });

  it("names files and labels periods", () => {
    expect(
      reportFileName({
        kind: "labour_attendance",
        from: "2026-08-01",
        to: "2026-08-31",
      }),
    ).toBe("all-labour-attendance-2026-08-01-to-2026-08-31");
    expect(reportFileName({ kind: "muster_roll", month: "2026-08" })).toBe(
      "muster-roll-and-wage-register-2026-08",
    );
    expect(rangeLabel({ from: "2026-08-01", to: "2026-08-31" })).toBe(
      "01 Aug 2026 to 31 Aug 2026",
    );
  });

  it("keeps a domain message and hides anything unexpected", () => {
    expect(failureMessage(new DomainError("X", "No such Project."))).toBe(
      "No such Project.",
    );
    const hidden = failureMessage(
      new Error("Invalid `prisma.x.findMany()` invocation:\n at stack"),
    );
    expect(hidden).not.toContain("prisma");
    expect(hidden).not.toContain("\n");
  });
});
