import { describe, expect, it } from "vitest";

import { summarize } from "../domain/ledger";
import {
  BalanceHandlers,
  statementOf,
  totalOf,
  type BalanceEntry,
  type BalanceParty,
  type BalanceStore,
} from "./balance-handlers";

let sequence = 0;
function entry(
  entryDate: string,
  kind: BalanceEntry["kind"],
  amount: number,
  extra: Partial<BalanceEntry> = {},
): BalanceEntry {
  sequence += 1;
  return {
    id: `e${String(sequence)}`,
    partyId: "raju",
    kind,
    amount,
    entryDate,
    projectId: "tower",
    sourceType: "labour_attendance",
    sourceId: `s${String(sequence)}`,
    reversesEntryId: null,
    ...extra,
  };
}

describe("statementOf", () => {
  it("opens with the sum before the range and runs the balance through it", () => {
    const paid = entry("2026-09-12", "payment", -30_000, {
      sourceType: "wage_payment",
    });
    const entries = [
      entry("2026-08-01", "opening", 100_000, { projectId: null }),
      entry("2026-08-20", "earned", 50_000),
      entry("2026-09-10", "earned", 70_000),
      paid,
      entry("2026-09-12", "payment", 30_000, {
        sourceType: "wage_payment",
        reversesEntryId: paid.id,
      }),
      entry("2026-10-01", "earned", 70_000),
    ];
    const statement = statementOf(entries, "2026-09-01", "2026-09-30");
    expect(statement.openingBalance).toBe(150_000);
    expect(statement.lines.map((line) => line.balance)).toEqual([
      220_000, 190_000, 220_000,
    ]);
    expect(statement.lines.map((line) => line.isReversed)).toEqual([
      false,
      true,
      false,
    ]);
    expect(statement.closingBalance).toBe(220_000);
  });

  it("is empty with opening = closing when nothing falls in the range", () => {
    const statement = statementOf(
      [entry("2026-08-01", "opening", -5_000)],
      "2026-09-01",
      "2026-09-30",
    );
    expect(statement).toEqual({
      openingBalance: -5_000,
      closingBalance: -5_000,
      lines: [],
    });
  });
});

describe("totalOf", () => {
  it("adds every figure of the summaries", () => {
    const range = { from: "2026-09-01", to: "2026-09-30" };
    const a = summarize(
      [
        entry("2026-08-01", "opening", 10_000),
        entry("2026-09-02", "earned", 700),
      ],
      range,
    );
    const b = summarize([entry("2026-09-03", "advance", -200)], range);
    expect(totalOf([a, b], range)).toMatchObject({
      previousBalance: 10_000,
      earned: 700,
      toPay: 700,
      advance: 200,
      finalAmount: 10_500,
    });
  });
});

function store(parties: BalanceParty[], entries: BalanceEntry[]): BalanceStore {
  return {
    parties: () => Promise.resolve(parties),
    party: (_w, _t, id) =>
      Promise.resolve(parties.find((party) => party.id === id) ?? null),
    hasEntriesIn: (_w, _t, id, projectId) =>
      Promise.resolve(
        entries.some(
          (item) => item.partyId === id && item.projectId === projectId,
        ),
      ),
    entries: (_w, _t, ids, to) =>
      Promise.resolve(
        entries.filter(
          (item) => ids.includes(item.partyId) && item.entryDate <= to,
        ),
      ),
    payments: () => Promise.resolve(new Map()),
    today: () => Promise.resolve("2026-09-15"),
  };
}

const projects = {
  find: (_w: string, ids: readonly string[]) =>
    Promise.resolve(
      new Map(
        ids
          .filter((id) => id !== "gone")
          .map((id) => [id, { id, name: id.toUpperCase() }]),
      ),
    ),
};

describe("BalanceHandlers", () => {
  const raju: BalanceParty = {
    id: "raju",
    name: "Raju",
    code: null,
    isActive: true,
    onProject: true,
  };
  const seema: BalanceParty = { ...raju, id: "seema", onProject: false };
  const entries = [
    entry("2026-08-01", "opening", 100_000, { projectId: null }),
    entry("2026-09-10", "earned", 70_000),
    entry("2026-09-11", "overtime", 20_000, { projectId: "villa" }),
    entry("2026-09-12", "earned", 35_000, {
      partyId: "seema",
      projectId: "villa",
    }),
  ];

  it("summarizes each party over all of its entries, defaulting to this month", async () => {
    const handlers = new BalanceHandlers(store([raju], entries), projects);
    const result = await handlers.balances({
      workspaceId: "w",
      projectId: "tower",
      partyType: "labour",
      kind: "monthly",
    });
    expect(result).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(result.items[0]?.summary).toMatchObject({
      previousBalance: 100_000,
      toPay: 90_000,
      finalAmount: 190_000,
    });
    expect(result.totals.finalAmount).toBe(190_000);
  });

  it("refuses a statement of a party neither on the Project nor with entries in it", async () => {
    const handlers = new BalanceHandlers(
      store([raju, seema], entries),
      projects,
    );
    await expect(
      handlers.statement({
        workspaceId: "w",
        projectId: "tower",
        partyType: "labour",
        partyId: "seema",
        from: "2026-09-01",
        to: "2026-09-30",
      }),
    ).rejects.toMatchObject({ code: "LABOUR_NOT_FOUND" });
    const statement = await handlers.statement({
      workspaceId: "w",
      projectId: "tower",
      partyType: "labour",
      partyId: "raju",
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(statement.lines.map((line) => line.projectName)).toEqual([
      "TOWER",
      "VILLA",
    ]);
  });

  it("refuses a period that ends before it starts and an unknown Project", async () => {
    const handlers = new BalanceHandlers(store([raju], entries), projects);
    await expect(
      handlers.balances({
        workspaceId: "w",
        projectId: "tower",
        partyType: "labour",
        kind: "custom",
        anchor: "2026-09-10",
        to: "2026-09-01",
      }),
    ).rejects.toMatchObject({ code: "PERIOD_INVALID" });
    await expect(
      handlers.balances({
        workspaceId: "w",
        projectId: "gone",
        partyType: "labour",
        kind: "monthly",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });
});
