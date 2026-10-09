import {
  byName,
  daysByLabour,
  daysWorked,
  hours,
  markOf,
  markWithOvertime,
  paidDays,
  tally,
  type ReportLabour,
  type ReportLabourDay,
} from "./labour-days";
import type { ReportLedgerEntry } from "./ledger-summary";
import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
  type ReportColumn,
} from "./report-document";
import { datesIn, monthRange } from "./report-period";

const SEX = { male: "M", female: "F", other: "O" } as const;

/**
 * The combined attendance register-cum-muster roll and wage register
 * (CM-218; CLRA Forms XVI and XVII as combined by the Ease of Compliance
 * rules) for one Project and one month: the Company's own Labours with
 * a column per day, days worked, wage rate, basic, overtime, gross,
 * deductions, net and a blank signature column.
 *
 * Wages come from the attendance snapshots (ADR CM-0004). M2 has no
 * deductions engine: Deductions is 0, advances paid in the month are shown
 * as Advance and taken off Net payable. Advance and Paid are the
 * Labour's ledger entries for this Project in the month.
 */
export function buildMusterRoll(input: {
  month: string;
  labours: readonly ReportLabour[];
  days: readonly ReportLabourDay[];
  /** Advance and payment entries for this Project in the month. */
  entries: readonly ReportLedgerEntry[];
}): ReportBody {
  const range = monthRange(input.month);
  const dates = datesIn(range);
  const inMonth = input.days.filter(
    (day) => day.date >= range.from && day.date <= range.to,
  );
  const byLabour = daysByLabour(inMonth);
  const money = new Map<string, { advance: number; paid: number }>();
  for (const entry of input.entries) {
    if (entry.entryDate < range.from || entry.entryDate > range.to) continue;
    const sum = money.get(entry.partyId) ?? { advance: 0, paid: 0 };
    if (entry.kind === "advance") sum.advance -= entry.amount;
    if (entry.kind === "payment") sum.paid -= entry.amount;
    money.set(entry.partyId, sum);
  }

  const columns: ReportColumn[] = [
    column("Sl. No.", "count", 4),
    column("Name", "text", 16),
    column("Father's name", "text", 14),
    column("Category", "text", 10),
    column("Sex", "text", 4),
    ...dates.map((date) => column(String(Number(date.slice(8))), "text", 4)),
    column("Days worked", "days", 7),
    column("Paid days", "days", 6),
    column("Wage type", "text", 8),
    column("Wage rate", "money", 10),
    column("Basic earned", "money", 12),
    column("OT hours", "hours", 6),
    column("OT amount", "money", 11),
    column("Gross", "money", 12),
    column("Advance", "money", 11),
    column("Deductions", "money", 10),
    column("Net payable", "money", 12),
    column("Paid in month", "money", 11),
    column("Signature / thumb impression", "text", 14),
  ];

  const labours = [...input.labours].sort(byName);
  const rows: Cell[][] = labours.map((labour, index) => {
    const own = byLabour.get(labour.id) ?? new Map<string, ReportLabourDay>();
    const marked = [...own.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const sum = tally(marked);
    // The wage as on the last marked day; the current wage when none is.
    const latest = marked.at(-1);
    const wageType = latest?.wageType ?? labour.wageType;
    const wageRate = latest?.wageRate ?? labour.wageRate;
    const gross = sum.earned + sum.overtimeAmount;
    const { advance, paid } = money.get(labour.id) ?? { advance: 0, paid: 0 };
    const deductions = 0;
    return [
      index + 1,
      labour.name,
      labour.fatherName,
      labour.category,
      labour.gender == null ? null : SEX[labour.gender],
      ...dates.map((date) => {
        const day = own.get(date);
        return day == null ? null : markWithOvertime(day);
      }),
      daysWorked(sum),
      paidDays(marked),
      wageType === "daily" ? "Per day" : "Per month",
      wageRate,
      sum.earned,
      hours(sum.overtimeHundredths),
      sum.overtimeAmount,
      gross,
      advance,
      deductions,
      gross - advance - deductions,
      paid,
      null,
    ];
  });

  const totals = totalsOf(columns, rows, { 1: "Total" });
  totals[0] = null;
  const wageRateIndex = columns.findIndex((col) => col.label === "Wage rate");
  totals[wageRateIndex] = null;
  dates.forEach((_, index) => {
    const at = labours.filter((labour) => {
      const day = byLabour.get(labour.id)?.get(dates[index] ?? "");
      if (day == null) return false;
      const mark = markOf(day);
      return mark === "P" || mark === "½";
    }).length;
    totals[index + 5] = at === 0 ? null : String(at);
  });

  return {
    title: "Register of Workmen cum Muster Roll and Wages",
    notes: [
      "Combined attendance register-cum-muster roll and wage register (CLRA Forms XVI and XVII, as combined by the Ease of Compliance rules).",
      "Covers the Company's own Labours on this Project. Vendor headcount is not named, so vendor labour is not on this register.",
      "P present, ½ half day, A absent, L leave, PL paid leave, H holiday; P+2 is present with 2 overtime hours. Days worked = present + ½ x half days; Paid days follow the wage rules (holidays are paid on a monthly wage).",
      "Deductions are 0: there is no deductions engine yet. Advances paid in the month are shown as Advance and taken off Net payable.",
    ],
    tables: [{ name: "Muster roll", columns, rows, totals }],
  };
}
