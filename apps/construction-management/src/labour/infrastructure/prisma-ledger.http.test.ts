import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { summarize } from "../domain/ledger";
import { prismaLedger } from "./prisma-ledger";

describe("prismaLedger (ADR CM-0004)", () => {
  it("appends, reverses a source's live entries once, and sums balances", async () => {
    const workspaceId = randomUUID();
    const labourId = randomUUID();
    const attendanceId = randomUUID();
    const party = { partyType: "labour" as const, partyId: labourId };
    const posted = (amount: number, kind: "earned" | "overtime") => ({
      ...party,
      projectId: randomUUID(),
      entryDate: "2026-10-05",
      kind,
      amount,
      sourceType: "labour_attendance" as const,
      sourceId: attendanceId,
      reversesEntryId: null,
    });

    await prisma.$transaction(async (tx) => {
      await prismaLedger.post(tx, workspaceId, "user", [
        {
          ...party,
          projectId: null,
          entryDate: "2026-10-01",
          kind: "opening",
          amount: 5000,
          sourceType: "labour",
          sourceId: labourId,
          reversesEntryId: null,
        },
        posted(80_000, "earned"),
        posted(24_000, "overtime"),
        posted(0, "overtime"),
      ]);
    });
    // Re-marking the day: reverse what it wrote, post the new amount.
    await prisma.$transaction(async (tx) => {
      expect(
        await prismaLedger.reverseSource(
          tx,
          workspaceId,
          "user",
          "labour_attendance",
          attendanceId,
        ),
      ).toBe(2);
      await prismaLedger.post(tx, workspaceId, "user", [
        posted(40_000, "earned"),
      ]);
    });
    // A second reversal only touches the new live entry.
    await prisma.$transaction(async (tx) => {
      expect(
        await prismaLedger.reverseSource(
          tx,
          workspaceId,
          "user",
          "labour_attendance",
          attendanceId,
        ),
      ).toBe(1);
    });

    const entries = await prismaLedger.entriesFor(prisma, workspaceId, party);
    expect(entries).toHaveLength(1 + 2 + 2 + 1 + 1);
    expect(
      summarize(entries, { from: "2026-10-01", to: "2026-10-31" }),
    ).toMatchObject({
      previousBalance: 5000,
      toPay: 0,
      finalAmount: 5000,
    });
    const balances = await prismaLedger.balances(
      prisma,
      workspaceId,
      "labour",
      [labourId, randomUUID()],
      "2026-10-31",
    );
    expect(balances.get(labourId)).toBe(5000);
    expect(balances.size).toBe(1);
  });
});
