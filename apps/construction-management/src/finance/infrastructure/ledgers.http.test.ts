import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { newId } from "@/src/shared-kernel/ids";
import { addProject, newCompany } from "@/test/companies";
import { seededAccounts } from "@/test/finance";

import { accountLedger } from "./account-ledger";
import { partyLedger } from "./party-ledger";

describe("finance ledgers on Postgres (ADR CM-0004, CM-0017 §3, §7)", () => {
  it("posts, reverses once, and sums as bigint up to a date", async () => {
    const company = await newCompany();
    const { cashId } = await seededAccounts(company.workspaceId);
    const sourceId = newId();
    await prisma.$transaction(async (tx) => {
      await accountLedger.post(tx, company.workspaceId, company.ownerId, [
        {
          accountId: cashId,
          projectId: null,
          entryDate: "2026-04-01",
          kind: "opening",
          amount: 50_000_00n,
          sourceType: "account",
          sourceId: cashId,
        },
        {
          accountId: cashId,
          projectId: null,
          entryDate: "2026-05-10",
          kind: "payment",
          amount: -12_345_00n,
          sourceType: "transaction",
          sourceId,
        },
        // Zero amounts are skipped.
        {
          accountId: cashId,
          projectId: null,
          entryDate: "2026-05-10",
          kind: "receipt",
          amount: 0n,
          sourceType: "transaction",
          sourceId,
        },
      ]);
    });
    const balance = (on: string | null) =>
      prisma.$transaction(async (tx) =>
        (
          await accountLedger.balances(tx, company.workspaceId, [cashId], on)
        ).get(cashId),
      );
    expect(await balance("2026-04-30")).toBe(50_000_00n);
    expect(await balance(null)).toBe(37_655_00n);

    const reversed = await prisma.$transaction((tx) =>
      accountLedger.reverseSource(
        tx,
        company.workspaceId,
        company.ownerId,
        "transaction",
        sourceId,
      ),
    );
    expect(reversed).toBe(1);
    expect(await balance(null)).toBe(50_000_00n);
    // A second reverse finds nothing live.
    const again = await prisma.$transaction((tx) =>
      accountLedger.reverseSource(
        tx,
        company.workspaceId,
        company.ownerId,
        "transaction",
        sourceId,
      ),
    );
    expect(again).toBe(0);
  });

  it("keeps a party's balance per Project", async () => {
    const company = await newCompany();
    const tower = await addProject(company.workspaceId, company.ownerId);
    const villa = await addProject(company.workspaceId, company.ownerId);
    const partyId = newId();
    await prisma.$transaction(async (tx) => {
      await partyLedger.post(tx, company.workspaceId, company.ownerId, [
        {
          partyType: "contractor",
          partyId,
          projectId: tower,
          entryDate: "2026-06-01",
          kind: "invoice",
          amount: 3_00_000_00n,
          sourceType: "invoice",
          sourceId: newId(),
        },
        {
          partyType: "contractor",
          partyId,
          projectId: tower,
          entryDate: "2026-06-05",
          kind: "payment",
          amount: -1_00_000_00n,
          sourceType: "party_payment",
          sourceId: newId(),
        },
        {
          partyType: "contractor",
          partyId,
          projectId: villa,
          entryDate: "2026-06-05",
          kind: "opening",
          amount: -25_000_00n,
          sourceType: "party_opening",
          sourceId: newId(),
        },
      ]);
    });
    const balances = (place: { projectId: string } | null) =>
      prisma.$transaction((tx) =>
        partyLedger.balances(
          tx,
          company.workspaceId,
          "contractor",
          [partyId],
          place,
        ),
      );
    expect((await balances({ projectId: tower })).get(partyId)).toBe(
      2_00_000_00n,
    );
    expect((await balances({ projectId: villa })).get(partyId)).toBe(
      -25_000_00n,
    );
    expect((await balances(null)).get(partyId)).toBe(1_75_000_00n);
  });

  it("refuses an entry whose sign does not fit its kind", async () => {
    const company = await newCompany();
    const { cashId } = await seededAccounts(company.workspaceId);
    await expect(
      prisma.$transaction((tx) =>
        accountLedger.post(tx, company.workspaceId, company.ownerId, [
          {
            accountId: cashId,
            projectId: null,
            entryDate: "2026-05-10",
            kind: "payment",
            amount: 100n,
            sourceType: "transaction",
            sourceId: newId(),
          },
        ]),
      ),
    ).rejects.toThrow(/account_entries_amount_check/);
  });
});
