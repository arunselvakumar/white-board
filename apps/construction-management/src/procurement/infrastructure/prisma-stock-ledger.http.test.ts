import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import type { StockPosting } from "../domain/stock-ledger";
import type { StockLocation } from "../domain/stock-location";
import { PrismaStockLedger } from "./prisma-stock-ledger";

const ledger = new PrismaStockLedger();

function setup() {
  const workspaceId = randomUUID();
  const site: StockLocation = { kind: "project", id: randomUUID() };
  const materialId = randomUUID();
  const context = { workspaceId, by: "user" };
  const posting = (
    type: StockPosting["type"],
    quantity: string,
    entryDate: string,
    sourceId = randomUUID(),
  ): StockPosting => ({
    location: site,
    materialId,
    entryDate,
    type,
    quantity,
    source: { type: "stock_movement", id: sourceId },
  });
  const write = (
    fn: (
      tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    ) => Promise<unknown>,
  ) => prisma.$transaction(fn);
  const stockOn = async (on?: string) =>
    (await ledger.stock(prisma, workspaceId, site, [materialId], on)).get(
      materialId,
    ) ?? "0";
  return { workspaceId, site, materialId, context, posting, write, stockOn };
}

describe("PrismaStockLedger (ADR CM-0015 §3, §5)", () => {
  it("signs entries by type and sums stock on a date", async () => {
    const { context, posting, write, stockOn } = setup();
    await write((tx) =>
      ledger.post(tx, context, [
        posting("received", "120", "2026-10-01"),
        posting("consumed", "20.5", "2026-10-03"),
        posting("adjustment", "-0.5", "2026-10-04"),
      ]),
    );
    expect(await stockOn("2026-10-02")).toBe("120.000");
    expect(await stockOn()).toBe("99.000");
  });

  it("refuses to go below zero on the date or any later date", async () => {
    const { context, posting, write, stockOn } = setup();
    await write((tx) =>
      ledger.post(tx, context, [
        posting("received", "100", "2026-10-01"),
        posting("consumed", "80", "2026-10-05"),
      ]),
    );
    // 30 on the 3rd leaves 70 then, but −10 on the 5th.
    await expect(
      write((tx) =>
        ledger.post(tx, context, [posting("consumed", "30", "2026-10-03")]),
      ),
    ).rejects.toMatchObject({
      code: "STOCK_INSUFFICIENT",
      details: {
        shortfalls: [
          expect.objectContaining({ shortBy: "10.000", onDate: "2026-10-05" }),
        ],
      },
    });
    expect(await stockOn()).toBe("20.000");
  });

  it("reverses a source once and checks an edit as a whole", async () => {
    const { context, posting, write, stockOn } = setup();
    const grn = randomUUID();
    await write((tx) =>
      ledger.post(tx, context, [posting("received", "50", "2026-10-01", grn)]),
    );
    await write((tx) =>
      ledger.post(tx, context, [posting("consumed", "30", "2026-10-02")]),
    );

    // Lowering the receipt to 40 is fine; to 20 is not.
    await write((tx) =>
      ledger.replaceSource(tx, context, { type: "stock_movement", id: grn }, [
        posting("received", "40", "2026-10-01", grn),
      ]),
    );
    expect(await stockOn()).toBe("10.000");
    await expect(
      write((tx) =>
        ledger.replaceSource(tx, context, { type: "stock_movement", id: grn }, [
          posting("received", "20", "2026-10-01", grn),
        ]),
      ),
    ).rejects.toMatchObject({ code: "STOCK_INSUFFICIENT" });

    // Deleting it would leave −30.
    await expect(
      write((tx) =>
        ledger.reverseSource(tx, context, { type: "stock_movement", id: grn }),
      ),
    ).rejects.toMatchObject({ code: "STOCK_INSUFFICIENT" });
    expect(await stockOn()).toBe("10.000");

    const entries = await prisma.constructionProcurementStockEntry.findMany({
      where: { sourceId: grn },
      orderBy: { createdAt: "asc" },
    });
    // 50, then the reversal of 50 and the new 40: nothing updated or deleted.
    expect(entries.map((entry) => entry.quantity.toFixed(3))).toEqual(
      expect.arrayContaining(["50.000", "-50.000", "40.000"]),
    );
    expect(entries).toHaveLength(3);
  });

  it("lets two reversals of one source run at once: the second finds nothing live", async () => {
    const { context, posting, write, stockOn } = setup();
    const grn = randomUUID();
    await write((tx) =>
      ledger.post(tx, context, [posting("received", "25", "2026-10-01", grn)]),
    );
    const source = { type: "stock_movement" as const, id: grn };
    const results = await Promise.allSettled([
      write((tx) => ledger.reverseSource(tx, context, source)),
      write((tx) => ledger.reverseSource(tx, context, source)),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect(await stockOn()).toBe("0.000");
    const reversals = await prisma.constructionProcurementStockEntry.count({
      where: { sourceId: grn, reversesEntryId: { not: null } },
    });
    expect(reversals).toBe(1);
  });

  it("makes a reversal wait for an uncommitted post of the same source", async () => {
    const { context, posting, write, stockOn } = setup();
    const grn = randomUUID();
    const source = { type: "stock_movement" as const, id: grn };
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let posted: () => void = () => undefined;
    const hasPosted = new Promise<void>((resolve) => {
      posted = resolve;
    });
    // The post holds its transaction open after writing…
    const post = write(async (tx) => {
      await ledger.post(tx, context, [
        posting("received", "40", "2026-10-01", grn),
      ]);
      posted();
      await held;
    });
    await hasPosted;
    // …so the reversal must wait for it, then reverse what it wrote.
    const reversal = write((tx) => ledger.reverseSource(tx, context, source));
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await Promise.all([post, reversal]);
    expect(await stockOn()).toBe("0.000");
    expect(
      await prisma.constructionProcurementStockEntry.count({
        where: { sourceId: grn, reversesEntryId: { not: null } },
      }),
    ).toBe(1);
  });

  it("serialises concurrent writers to the same stock", async () => {
    const { context, posting, write, stockOn } = setup();
    await write((tx) =>
      ledger.post(tx, context, [posting("received", "10", "2026-10-01")]),
    );
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        write((tx) =>
          ledger.post(tx, context, [posting("consumed", "3", "2026-10-02")]),
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(3);
    expect(await stockOn()).toBe("1.000");
  });
});
