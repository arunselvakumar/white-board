import { describe, expect, it } from "vitest";

import {
  buildBoqExecutedReport,
  buildRetentionRegister,
  buildWorkOrderRegister,
} from "./contracts-reports";

const ITEM = {
  section: "Civil works",
  itemNo: "1.1",
  description: "Excavation",
  unit: "cum",
  boqQuantity: 100,
  executed: 40,
  billed: 30,
  rate: 450_00,
};

describe("contracts reports (CM-1111)", () => {
  it("BOQ vs Executed: balance and % executed; amounts only with Financial, never summing quantities or rates", () => {
    const priced = buildBoqExecutedReport({
      asOn: "2026-10-23",
      rows: [
        ITEM,
        {
          ...ITEM,
          itemNo: "1.2",
          unit: "sqm",
          boqQuantity: 0,
          executed: 0,
          billed: 0,
        },
      ],
      financial: true,
    });
    const [table] = priced.tables;
    expect(table?.rows[0]).toEqual([
      "Civil works",
      "1.1",
      "Excavation",
      "cum",
      100,
      40,
      30,
      60,
      40,
      450_00,
      45_000_00,
      18_000_00,
      13_500_00,
    ]);
    // No % for an item with no quantity.
    expect(table?.rows[1]?.[8]).toBeNull();
    expect(table?.totals).toEqual([
      "Total",
      null,
      "2 items",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      45_000_00,
      18_000_00,
      13_500_00,
    ]);

    const plain = buildBoqExecutedReport({
      asOn: "2026-10-23",
      rows: [ITEM],
      financial: false,
    });
    expect(plain.tables[0]?.columns.map((col) => col.label)).toEqual([
      "Section",
      "Item No.",
      "Description",
      "Unit",
      "BOQ Qty",
      "Executed",
      "Billed",
      "Balance",
      "% Executed",
    ]);
    expect(plain.notes).toContain(
      "Amounts are left out (they need Financial).",
    );
  });

  it("Work Order Register: a draft has no number; revisions are not summed", () => {
    const body = buildWorkOrderRegister({
      rows: [
        {
          number: null,
          orderDate: "2026-09-23",
          contractor: "Velan Constructions",
          department: null,
          status: "Draft",
          revision: 2,
          retentionPercent: 5,
          value: 35_000_00,
          billed: 10_000_00,
        },
      ],
      financial: true,
    });
    expect(body.tables[0]?.rows[0]?.[0]).toBe("Draft");
    expect(body.tables[0]?.totals).toEqual([
      "Total",
      "1 Work Order",
      null,
      null,
      null,
      null,
      null,
      35_000_00,
      10_000_00,
      25_000_00,
    ]);
  });

  it("Retention Register: the client side only when the requester may see it", () => {
    const row = {
      contract: "WO/26-27/00001",
      party: "Velan Constructions",
      retentionPercent: 5,
      held: 500_00,
      released: 200_00,
    };
    const without = buildRetentionRegister({
      asOn: "2026-10-23",
      contractor: [row],
      client: null,
    });
    expect(without.tables.map((table) => table.name)).toEqual([
      "Held from Contractors",
    ]);
    expect(without.tables[0]?.rows[0]?.at(-1)).toBe(300_00);
    const both = buildRetentionRegister({
      asOn: "2026-10-23",
      contractor: [row],
      client: [{ ...row, contract: "Client contract" }],
    });
    expect(both.tables.map((table) => table.name)).toEqual([
      "Held from Contractors",
      "Held by the Client",
    ]);
  });
});
