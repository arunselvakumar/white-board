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

const DHURESH: ReportLabour = {
  id: "dhuresh",
  name: "Dhuresh Nawin",
  labourCode: "L-1",
  fatherName: "Nawin Kumar",
  category: "Mason",
  gender: "male",
  wageType: "daily",
  wageRate: 80_000,
};
const ABIRAMI: ReportLabour = {
  id: "abirami",
  name: "Abirami Priya",
  labourCode: null,
  fatherName: null,
  category: "Helper",
  gender: "female",
  wageType: "monthly",
  wageRate: 1_550_000,
};
const IDLE: ReportLabour = { ...DHURESH, id: "idle", name: "Zed Idle" };

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
 * August 2026 has 31 days. Dhuresh (daily ₹800): present every weekday 1–31
 * except: half day on the 3rd, absent on the 4th, leave on the 5th, paid
 * leave on the 6th, holiday on the 7th; 2.5 OT hours on the 10th and 1.25
 * on the 31st at ₹100/h. Abirami (monthly ₹15,500 → ₹500 a day): present on
 * the 1st, holiday on the 2nd, half day on the 31st.
 */
function august(): ReportLabourDay[] {
  const days: ReportLabourDay[] = [];
  for (const date of datesIn(monthRange("2026-08"))) {
    const n = Number(date.slice(8));
    if (n === 3)
      days.push(day("dhuresh", date, { status: "half_day", earned: 40_000 }));
    else if (n === 4)
      days.push(day("dhuresh", date, { status: "absent", earned: 0 }));
    else if (n === 5)
      days.push(day("dhuresh", date, { status: "on_leave", earned: 0 }));
    else if (n === 6)
      days.push(
        day("dhuresh", date, { status: "on_leave", isPaidLeave: true }),
      );
    else if (n === 7)
      days.push(day("dhuresh", date, { status: "holiday", earned: 0 }));
    else if (n === 10)
      days.push(
        day("dhuresh", date, {
          overtimeHundredths: 250,
          overtimeAmount: 25_000,
        }),
      );
    else if (n === 31)
      days.push(
        day("dhuresh", date, {
          overtimeHundredths: 125,
          overtimeAmount: 12_500,
          supervisor: "Murugan",
          shift: "Shift 1",
        }),
      );
    else days.push(day("dhuresh", date));
  }
  const monthly = { wageType: "monthly" as const, wageRate: 1_550_000 };
  days.push(
    day("abirami", "2026-08-01", { ...monthly, earned: 50_000 }),
    day("abirami", "2026-08-02", {
      ...monthly,
      status: "holiday",
      earned: 50_000,
    }),
    day("abirami", "2026-08-31", {
      ...monthly,
      status: "half_day",
      earned: 25_000,
    }),
  );
  return days;
}

// Dhuresh: 31 days − 5 special = 26 present days at ₹800 + half ₹400 + PL ₹800.
const DHURESH_EARNED = 26 * 80_000 + 40_000 + 80_000;
const ABIRAMI_EARNED = 125_000;

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
      labours: [DHURESH, ABIRAMI, IDLE],
      days: august(),
    });
    const [summary, byDay] = report.tables;
    // Only Labours marked in the period, by name.
    expect(summary?.rows.map((row) => row[1])).toEqual([
      "Abirami Priya",
      "Dhuresh Nawin",
    ]);
    const dhuresh = rowOf(summary, "Dhuresh Nawin");
    expect(dhuresh("Present")).toBe(26);
    expect(dhuresh("Half day")).toBe(1);
    expect(dhuresh("Absent")).toBe(1);
    expect(dhuresh("Leave")).toBe(1);
    expect(dhuresh("Paid leave")).toBe(1);
    expect(dhuresh("Holiday")).toBe(1);
    expect(dhuresh("OT hours")).toBe(3.75);
    expect(totalOf(summary, "Present")).toBe(27);
    expect(totalOf(summary, "Half day")).toBe(2);
    expect(totalOf(summary, "Holiday")).toBe(2);
    expect(totalOf(summary, "OT hours")).toBe(3.75);
    expect(summary?.totals?.[1]).toBe("Total");

    expect(byDay?.rows).toHaveLength(31 + 3);
    expect(byDay?.rows[0]).toEqual([
      "01 Aug 2026",
      "Abirami Priya",
      null,
      "Present",
      null,
      null,
      0,
    ]);
    expect(byDay?.rows.at(-1)).toEqual([
      "31 Aug 2026",
      "Dhuresh Nawin",
      "L-1",
      "Present",
      "Shift 1",
      "Murugan",
      1.25,
    ]);
    expect(totalOf(byDay, "OT hours")).toBe(3.75);
  });

  it("leaves out days outside the range", () => {
    const report = buildLabourAttendanceReport({
      range: { from: "2026-08-01", to: "2026-08-02" },
      labours: [DHURESH, ABIRAMI],
      days: august(),
    });
    expect(rowOf(report.tables[0], "Dhuresh Nawin")("Present")).toBe(2);
    expect(report.tables[1]?.rows).toHaveLength(4);
  });
});

describe("Month-wise Labour", () => {
  it("lays out Labour × 31 days with marks, counts and earnings", () => {
    const report = buildMonthWiseLabourReport({
      month: "2026-08",
      labours: [DHURESH, ABIRAMI],
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
    const dhuresh = rowOf(table, "Dhuresh Nawin");
    expect(["1", "3", "4", "5", "6", "7"].map(dhuresh)).toEqual([
      "P",
      "½",
      "A",
      "L",
      "PL",
      "H",
    ]);
    expect(dhuresh("OT hrs")).toBe(3.75);
    expect(dhuresh("Earned")).toBe(DHURESH_EARNED);
    expect(dhuresh("OT amount")).toBe(37_500);
    expect(dhuresh("Total")).toBe(DHURESH_EARNED + 37_500);
    const abirami = rowOf(table, "Abirami Priya");
    expect(abirami("2")).toBe("H");
    expect(abirami("15")).toBeNull();
    // Day totals count Labours at work; the 31st has Dhuresh P and Abirami ½.
    expect(totalOf(table, "31")).toBe("2");
    expect(totalOf(table, "4")).toBeNull();
    expect(totalOf(table, "Earned")).toBe(DHURESH_EARNED + ABIRAMI_EARNED);
  });

  it("leaves the money columns out without Financial", () => {
    const report = buildMonthWiseLabourReport({
      month: "2026-08",
      labours: [DHURESH],
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
    entry("dhuresh", "opening", 100_000, "2026-06-01"),
    entry("dhuresh", "earned", 80_000, "2026-07-31"),
    entry("dhuresh", "payment", -50_000, "2026-07-31"),
    // In the period.
    entry("dhuresh", "earned", 80_000, "2026-08-01"),
    entry("dhuresh", "earned", 80_000, "2026-08-02"),
    entry("dhuresh", "overtime", 25_000, "2026-08-02"),
    // The 2nd re-marked as a half day: reversal (same kind), then ₹400.
    entry("dhuresh", "earned", -80_000, "2026-08-02"),
    entry("dhuresh", "earned", 40_000, "2026-08-02"),
    entry("dhuresh", "advance", -30_000, "2026-08-10"),
    entry("dhuresh", "payment", -60_000, "2026-08-20"),
    // A cancelled payment nets out.
    entry("dhuresh", "payment", -10_000, "2026-08-21"),
    entry("dhuresh", "payment", 10_000, "2026-08-21"),
    // After the period: ignored.
    entry("dhuresh", "earned", 80_000, "2026-09-01"),
    // Abirami joins in the period with an advance given before the app
    // (opening dated inside the period counts as Previous Balance).
    entry("abirami", "opening", -20_000, "2026-08-15"),
    entry("abirami", "earned", 50_000, "2026-08-16"),
  ];

  it("maps entries to Previous Balance, To Pay, Advance, Paid and Final Amount", () => {
    expect(
      paymentFigures(
        entries.filter((e) => e.partyId === "dhuresh"),
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
        entries.filter((e) => e.partyId === "abirami"),
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
      labours: [DHURESH, ABIRAMI, IDLE],
      entries,
    });
    const [table] = report.tables;
    expect(table?.rows.map((row) => row[1])).toEqual([
      "Abirami Priya",
      "Dhuresh Nawin",
      "Zed Idle",
    ]);
    expect(rowOf(table, "Dhuresh Nawin")("Final Amount")).toBe(185_000);
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
      vendorName: "Muthu Gang",
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
      vendorName: "Prabhu",
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
      filters: { vendor: "Muthu Gang", category: null },
    });
    const labels = report.tables[0]?.columns.map((col) => col.label);
    expect(labels?.[1]).toBe("Project");
    expect(labels).not.toContain("Pay");
    expect(report.title).toBe("Central Vendor Attendance Report");
    expect(report.notes[0]).toBe("Vendor: Muthu Gang");
  });
});

describe("Muster roll (combined register)", () => {
  it("has the combined register columns and computes days, wages and net", () => {
    const report = buildMusterRoll({
      month: "2026-08",
      labours: [DHURESH, ABIRAMI, IDLE],
      days: august(),
      entries: [
        {
          partyId: "dhuresh",
          kind: "advance",
          amount: -30_000,
          entryDate: "2026-08-10",
        },
        {
          partyId: "dhuresh",
          kind: "payment",
          amount: -60_000,
          entryDate: "2026-08-20",
        },
        {
          partyId: "dhuresh",
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

    const dhuresh = rowOf(table, "Dhuresh Nawin");
    expect(dhuresh("Father's name")).toBe("Nawin Kumar");
    expect(dhuresh("Sex")).toBe("M");
    expect(dhuresh("10")).toBe("P+2.5");
    expect(dhuresh("31")).toBe("P+1.25");
    expect(dhuresh("3")).toBe("½");
    expect(dhuresh("Days worked")).toBe(26.5);
    // Present 26 + half 0.5 + paid leave 1; the holiday is unpaid on a daily wage.
    expect(dhuresh("Paid days")).toBe(27.5);
    expect(dhuresh("Wage type")).toBe("Per day");
    expect(dhuresh("Wage rate")).toBe(80_000);
    expect(dhuresh("Basic earned")).toBe(DHURESH_EARNED);
    expect(dhuresh("OT amount")).toBe(37_500);
    expect(dhuresh("Gross")).toBe(DHURESH_EARNED + 37_500);
    expect(dhuresh("Advance")).toBe(30_000);
    expect(dhuresh("Deductions")).toBe(0);
    expect(dhuresh("Net payable")).toBe(DHURESH_EARNED + 37_500 - 30_000);
    expect(dhuresh("Paid in month")).toBe(60_000);
    expect(dhuresh("Signature / thumb impression")).toBeNull();

    const abirami = rowOf(table, "Abirami Priya");
    // A holiday is paid on a monthly wage.
    expect(abirami("Days worked")).toBe(1.5);
    expect(abirami("Paid days")).toBe(2.5);
    expect(abirami("Wage type")).toBe("Per month");
    expect(abirami("Sex")).toBe("F");

    // On the Project but not marked: a blank row at the current wage.
    const idle = rowOf(table, "Zed Idle");
    expect(idle("1")).toBeNull();
    expect(idle("Gross")).toBe(0);
    expect(idle("Wage rate")).toBe(80_000);

    expect(totalOf(table, "Gross")).toBe(
      DHURESH_EARNED + 37_500 + ABIRAMI_EARNED,
    );
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
