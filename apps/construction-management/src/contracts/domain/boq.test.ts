import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  boqAmount,
  boqItemFields,
  boqQuantity,
  boqTotals,
  movedOrder,
  orderValueDifference,
  quantityText,
  sameBoqKey,
  sectionTitle,
  type BoqItemInput,
} from "./boq";
import { deviationLimit, isDeviation, percentOver } from "./deviation";
import {
  appliedChange,
  fromApprovalStatus,
  toApprovalStatus,
  variationContent,
} from "./variation";

const UOM = "0199c0de-0000-7000-8000-000000000001";
const SECTION = "0199c0de-0000-7000-8000-000000000002";
const ITEM = "0199c0de-0000-7000-8000-000000000003";

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return "none";
}

const base: BoqItemInput = {
  itemNo: " 2.1.3 ",
  description: "  PCC 1:4:8 in foundations ",
  uomId: UOM,
  quantity: "12.5",
  rate: 6_123_45,
};

describe("BOQ item fields (CM-1103)", () => {
  it("tidies the fields and keeps four decimals of quantity", () => {
    const fields = boqItemFields({ ...base, sacHsn: " 9954 11 " });
    expect(fields).toMatchObject({
      itemNo: "2.1.3",
      description: "PCC 1:4:8 in foundations",
      sacHsn: "995411",
      quantity: 125_000n,
      rate: 612_345n,
      wingId: null,
      locationId: null,
    });
    expect(quantityText(fields.quantity)).toBe("12.5000");
  });

  it("refuses a missing item no, description, zero quantity, five decimals and a negative rate", () => {
    expect(codeOf(() => boqItemFields({ ...base, itemNo: "  " }))).toBe(
      "BOQ_ITEM_NO_REQUIRED",
    );
    expect(
      codeOf(() => boqItemFields({ ...base, itemNo: "x".repeat(33) })),
    ).toBe("BOQ_ITEM_NO_TOO_LONG");
    expect(codeOf(() => boqItemFields({ ...base, description: "" }))).toBe(
      "BOQ_ITEM_DESCRIPTION_REQUIRED",
    );
    expect(codeOf(() => boqItemFields({ ...base, quantity: "0" }))).toBe(
      "BOQ_QUANTITY_INVALID",
    );
    expect(codeOf(() => boqItemFields({ ...base, quantity: "1.23456" }))).toBe(
      "BOQ_QUANTITY_INVALID",
    );
    expect(codeOf(() => boqItemFields({ ...base, rate: -1 }))).toBe(
      "BOQ_RATE_INVALID",
    );
    expect(codeOf(() => boqItemFields({ ...base, sacHsn: "99" }))).toBe(
      "SAC_HSN_INVALID",
    );
    expect(
      codeOf(() =>
        boqItemFields({ ...base, wingId: ITEM, locationId: SECTION }),
      ),
    ).toBe("BOQ_ITEM_PLACE_INVALID");
  });

  it("refuses an amount over ₹1,000 crore", () => {
    expect(
      codeOf(() =>
        boqItemFields({ ...base, quantity: "1000000", rate: 1_000_000_01 }),
      ),
    ).toBe("BOQ_AMOUNT_TOO_LARGE");
  });

  it("reads quantities as ten-thousandths, trailing zeros allowed", () => {
    expect(boqQuantity("0.0001")).toBe(1n);
    expect(boqQuantity("3.50000")).toBe(35_000n);
    expect(boqQuantity(2.25)).toBe(22_500n);
    expect(boqQuantity("-1")).toBeNull();
    expect(boqQuantity("1e3")).toBeNull();
    expect(boqQuantity("1000000000000")).toBeNull();
  });

  it("matches titles and item numbers ignoring case and spacing", () => {
    expect(sameBoqKey("Sub  Structure", "sub structure ")).toBe(true);
    expect(sectionTitle("  Earth  work ")).toBe("Earth work");
    expect(codeOf(() => sectionTitle(" "))).toBe("BOQ_SECTION_TITLE_REQUIRED");
  });
});

describe("BOQ totals (CM-1103)", () => {
  it("rounds each line half up before summing", () => {
    // 1.0005 × 1 paisa → 1; 0.5 × 1 paisa = 0.5 → 1 (half up); 0.4999 → 0.
    expect(boqAmount(10_005n, 1n)).toBe(1n);
    expect(boqAmount(5_000n, 1n)).toBe(1n);
    expect(boqAmount(4_999n, 1n)).toBe(0n);
    // 12.5 cum × ₹6,123.45 = ₹76,543.125 → ₹76,543.13.
    expect(boqAmount(125_000n, 612_345n)).toBe(7_654_313n);
  });

  it("totals each section and the BOQ from the rounded lines", () => {
    const totals = boqTotals([
      { sectionId: "a", quantity: 5_000n, rate: 1n },
      { sectionId: "a", quantity: 5_000n, rate: 1n },
      { sectionId: "b", quantity: 125_000n, rate: 612_345n },
    ]);
    // Two half-paise lines round to 1 each, not 1 together.
    expect(totals.sections.get("a")).toBe(2n);
    expect(totals.sections.get("b")).toBe(7_654_313n);
    expect(totals.total).toBe(7_654_315n);
    expect(orderValueDifference(totals.total, 7_000_000n)).toBe(654_315n);
    expect(orderValueDifference(totals.total, null)).toBeNull();
  });

  it("moves one place up or down, and not past either end", () => {
    expect(movedOrder(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(movedOrder(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(movedOrder(["a", "b"], "a", "up")).toBeNull();
    expect(movedOrder(["a", "b"], "b", "down")).toBeNull();
    expect(movedOrder(["a"], "z", "up")).toBeNull();
  });
});

describe("Variations (CM-1103)", () => {
  it("keeps only what each kind needs", () => {
    const extra = variationContent({
      kind: "extra_item",
      reason: " Client asked for a sump ",
      sectionId: SECTION,
      itemNo: "9.1",
      description: "Sump excavation",
      uomId: UOM,
      newQuantity: "40",
      newRate: 450_00,
      boqItemId: ITEM,
    });
    expect(extra).toEqual({
      kind: "extra_item",
      reason: "Client asked for a sump",
      sectionId: SECTION,
      itemNo: "9.1",
      description: "Sump excavation",
      uomId: UOM,
      sacHsn: null,
      newQuantity: 400_000n,
      newRate: 45_000n,
    });
    expect(
      variationContent({
        kind: "quantity",
        reason: "More depth",
        boqItemId: ITEM,
        newQuantity: "15",
        newRate: 1,
      }),
    ).toEqual({
      kind: "quantity",
      reason: "More depth",
      boqItemId: ITEM,
      newQuantity: 150_000n,
    });
  });

  it("needs a reason, the item, and a valid figure", () => {
    expect(
      codeOf(() =>
        variationContent({
          kind: "rate",
          reason: " ",
          boqItemId: ITEM,
          newRate: 1,
        }),
      ),
    ).toBe("VARIATION_REASON_REQUIRED");
    expect(
      codeOf(() => variationContent({ kind: "rate", reason: "x", newRate: 1 })),
    ).toBe("VARIATION_ITEM_REQUIRED");
    expect(
      codeOf(() =>
        variationContent({ kind: "rate", reason: "x", boqItemId: ITEM }),
      ),
    ).toBe("BOQ_RATE_INVALID");
    expect(
      codeOf(() =>
        variationContent({
          kind: "quantity",
          reason: "x",
          boqItemId: ITEM,
          newQuantity: "0",
        }),
      ),
    ).toBe("BOQ_QUANTITY_INVALID");
    expect(
      codeOf(() =>
        variationContent({ kind: "extra_item", reason: "x", itemNo: "1" }),
      ),
    ).toBe("VARIATION_SECTION_REQUIRED");
  });

  it("applies a quantity or rate change and keeps what it replaced", () => {
    const current = { quantity: 100_000n, rate: 45_000n };
    expect(
      appliedChange({ kind: "quantity", newQuantity: 130_000n }, current),
    ).toEqual({
      next: { quantity: 130_000n, rate: 45_000n },
      previousQuantity: 100_000n,
      previousRate: null,
    });
    expect(appliedChange({ kind: "rate", newRate: 48_000n }, current)).toEqual({
      next: { quantity: 100_000n, rate: 48_000n },
      previousQuantity: null,
      previousRate: 45_000n,
    });
    expect(
      codeOf(() =>
        appliedChange(
          { kind: "rate", newRate: 10_000_000_000_000n },
          { quantity: 20_000n, rate: 1n },
        ),
      ),
    ).toBe("BOQ_AMOUNT_TOO_LARGE");
  });

  it("maps its stored status to the approval kernel's", () => {
    expect(toApprovalStatus("pending_approval")).toBe("pending");
    expect(fromApprovalStatus("pending")).toBe("pending_approval");
    expect(fromApprovalStatus("rejected")).toBe("rejected");
  });
});

describe("Deviation (CM-1103)", () => {
  it("reads the limit as hundredths of a percent, 0 to 100", () => {
    expect(deviationLimit("25")).toBe(2_500n);
    expect(deviationLimit(12.5)).toBe(1_250n);
    expect(codeOf(() => deviationLimit("100.01"))).toBe(
      "DEVIATION_LIMIT_INVALID",
    );
    expect(codeOf(() => deviationLimit("1.234"))).toBe(
      "DEVIATION_LIMIT_INVALID",
    );
  });

  it("flags only what is beyond current × (1 + limit)", () => {
    // 100 current, 25 %: 125 is within, 125.0001 is over.
    expect(isDeviation(1_250_000n, 1_000_000n, 2_500n)).toBe(false);
    expect(isDeviation(1_250_001n, 1_000_000n, 2_500n)).toBe(true);
    // A 0 % limit flags anything over the quantity.
    expect(isDeviation(1_000_001n, 1_000_000n, 0n)).toBe(true);
    expect(isDeviation(1_000_000n, 1_000_000n, 0n)).toBe(false);
  });

  it("says how far over, rounded half up to two places", () => {
    expect(percentOver(1_300_000n, 1_000_000n)).toBe(3_000n);
    // 2/3 over = 66.666… % → 66.67 %.
    expect(percentOver(50_000n, 30_000n)).toBe(6_667n);
    expect(percentOver(1n, 0n)).toBeNull();
  });
});
