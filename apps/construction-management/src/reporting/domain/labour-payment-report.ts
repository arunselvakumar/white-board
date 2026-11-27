import { byName, type ReportEmployee } from "./labour-days";
import { paymentFigures, type ReportLedgerEntry } from "./ledger-summary";
import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
} from "./report-document";
import type { DateRange } from "./report-period";

/**
 * Employee Payments (CM-217): per Employee Previous Balance, Earned,
 * Overtime, To Pay, Advance, Paid and Final Amount for a period, from the
 * ledger (ADR CM-0004). A balance belongs to the Employee and moves with
 * them on transfer, so the figures are the Employee's whole ledger.
 * Always carries amounts: the route refuses it without Financial.
 */
export function buildLabourPaymentReport(input: {
  range: DateRange;
  employees: readonly ReportEmployee[];
  entries: readonly ReportLedgerEntry[];
}): ReportBody {
  const byParty = new Map<string, ReportLedgerEntry[]>();
  for (const entry of input.entries) {
    const own = byParty.get(entry.partyId) ?? [];
    own.push(entry);
    byParty.set(entry.partyId, own);
  }
  const columns = [
    column("Sl. No.", "count", 5),
    column("Employee", "text", 22),
    column("Employee Id", "text", 10),
    column("Category", "text", 14),
    column("Previous Balance", "money", 13),
    column("Earned", "money"),
    column("Overtime", "money"),
    column("To Pay", "money"),
    column("Advance", "money"),
    column("Paid", "money"),
    column("Final Amount", "money", 13),
  ];
  const rows: Cell[][] = [...input.employees]
    .sort(byName)
    .map((employee, index) => {
      const figures = paymentFigures(
        byParty.get(employee.id) ?? [],
        input.range,
      );
      return [
        index + 1,
        employee.name,
        employee.employeeCode,
        employee.category,
        figures.previousBalance,
        figures.earned,
        figures.overtime,
        figures.toPay,
        figures.advance,
        figures.paid,
        figures.finalAmount,
      ];
    });
  const totals = totalsOf(columns, rows, { 1: "Total" });
  totals[0] = null;
  return {
    title: "Employee Payments Report",
    notes: [
      "Employees on this Project now, or with money for it in the period.",
      "Each Employee's figures are their whole ledger: a balance moves with the Employee on transfer.",
      "Previous Balance includes opening balances; Final Amount = Previous Balance + To Pay - Advance - Paid. A negative amount is owed by the Employee.",
    ],
    tables: [{ name: "Payments", columns, rows, totals }],
  };
}
