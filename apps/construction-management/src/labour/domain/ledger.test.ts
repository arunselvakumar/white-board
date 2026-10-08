import { describe, expect, it } from "vitest";

import {
  balanceOn,
  liveEntries,
  monthOf,
  period,
  reversalOf,
  summarize,
  weekOf,
  type LedgerEntry,
} from "./ledger";
import { dayEarned, datesBetween, overtimeAmount, weekdayOf } from "./wages";

let next = 0;
function entry(
  kind: LedgerEntry["kind"],
  amount: number,
  entryDate: string,
): LedgerEntry {
  next += 1;
  return {
    id: `e${String(next)}`,
    kind,
    amount,
    entryDate,
    projectId: "p1",
    reversesEntryId: null,
  };
}

describe("periods", () => {
  it("finds months and Monday-to-Sunday weeks", () => {
    expect(monthOf("2026-10-17")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(weekOf("2026-10-08")).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    });
    expect(weekOf("2026-10-11")).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
    });
    expect(period("custom", "2026-10-03", "2026-10-09")).toEqual({
      from: "2026-10-03",
      to: "2026-10-09",
    });
    expect(() => period("custom", "2026-10-09", "2026-10-03")).toThrow(
      expect.objectContaining({ code: "PERIOD_INVALID" }),
    );
  });
});

describe("summarize — a 31-day month of a daily-wage labourer", () => {
  // ₹800 a day, Sundays off, a half day on every Saturday, 2 hours of
  // overtime at ₹120/hour on 10 and 20 October, ₹3,000 owed before the
  // month, a ₹2,000 advance on 6 October and a ₹10,000 payment on 25th.
  const wage = 80_000;
  const entries: LedgerEntry[] = [entry("opening", 3_00_000, "2026-09-01")];
  for (const date of datesBetween("2026-10-01", "2026-10-31")) {
    const weekday = weekdayOf(date);
    const status =
      weekday === 0 ? "holiday" : weekday === 6 ? "half_day" : "present";
    entries.push(
      entry(
        "earned",
        dayEarned({
          wageType: "daily",
          wageRate: wage,
          status,
          isPaidLeave: false,
          date,
        }),
        date,
      ),
    );
  }
  entries.push(entry("overtime", overtimeAmount("2", 12_000), "2026-10-10"));
  entries.push(entry("overtime", overtimeAmount("2", 12_000), "2026-10-20"));
  entries.push(entry("advance", -2_00_000, "2026-10-06"));
  entries.push(entry("payment", -10_00_000, "2026-10-25"));
  // A payment after the month must not count.
  entries.push(entry("payment", -50_000, "2026-11-01"));

  it("adds up to the legacy labour payment figures", () => {
    // October 2026: 4 Sundays, 5 Saturdays, 22 weekdays.
    const summary = summarize(entries, monthOf("2026-10-15"));
    expect(summary.previousBalance).toBe(3_00_000);
    expect(summary.earned).toBe(22 * wage + 5 * (wage / 2));
    expect(summary.overtime).toBe(48_000);
    expect(summary.toPay).toBe(summary.earned + 48_000);
    expect(summary.advance).toBe(2_00_000);
    expect(summary.paid).toBe(10_00_000);
    expect(summary.finalAmount).toBe(
      3_00_000 + summary.toPay - 2_00_000 - 10_00_000,
    );
    expect(summary.finalAmount).toBe(balanceOn(entries, "2026-10-31"));
  });

  it("carries the closing balance into the next period", () => {
    const october = summarize(entries, monthOf("2026-10-15"));
    const november = summarize(entries, monthOf("2026-11-15"));
    expect(november.previousBalance).toBe(october.finalAmount);
    expect(november.paid).toBe(50_000);
  });

  it("counts an opening balance dated inside the period as previous", () => {
    const summary = summarize(
      [
        entry("opening", 5000, "2026-10-12"),
        entry("earned", 100, "2026-10-13"),
      ],
      monthOf("2026-10-01"),
    );
    expect(summary.previousBalance).toBe(5000);
    expect(summary.toPay).toBe(100);
  });
});

describe("reversals", () => {
  it("cancels an entry and leaves only live entries", () => {
    const original = entry("earned", 80_000, "2026-10-05");
    const reversal = reversalOf({
      ...original,
      partyType: "labour",
      partyId: "l1",
      sourceType: "labour_attendance",
      sourceId: "a1",
    });
    expect(reversal).toMatchObject({
      kind: "earned",
      amount: -80_000,
      entryDate: "2026-10-05",
      reversesEntryId: original.id,
    });
    const replaced = entry("earned", 40_000, "2026-10-05");
    const all: LedgerEntry[] = [original, { ...reversal, id: "r1" }, replaced];
    expect(liveEntries(all)).toEqual([replaced]);
    expect(balanceOn(all, "2026-10-31")).toBe(40_000);
    expect(summarize(all, monthOf("2026-10-01")).earned).toBe(40_000);
  });

  it("never reverses a reversal", () => {
    expect(() =>
      reversalOf({
        ...entry("earned", -1, "2026-10-05"),
        reversesEntryId: "x",
        partyType: "labour",
        partyId: "l1",
        sourceType: "labour_attendance",
        sourceId: "a1",
      }),
    ).toThrow(expect.objectContaining({ code: "LEDGER_REVERSAL_OF_REVERSAL" }));
  });
});
