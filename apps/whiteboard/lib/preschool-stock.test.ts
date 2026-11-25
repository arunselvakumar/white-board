import { describe, expect, it } from "vitest";

import {
  formatQuantityDelta,
  insufficientStockRow,
  stockCounterparty,
} from "./preschool-stock";

const none = {
  child: null,
  classroom: null,
  staff: null,
  otherCentre: null,
  supplierName: null,
  billNumber: null,
};

describe("preschool stock helpers", () => {
  it("signs a quantity", () => {
    expect(formatQuantityDelta(20)).toBe("+20");
    expect(formatQuantityDelta(-4)).toBe("−4");
  });

  it("says who or where a movement went", () => {
    expect(
      stockCounterparty({
        ...none,
        kind: "issued_to_child",
        child: { id: "c", name: "Aarav" },
      }),
    ).toBe("Aarav");
    expect(
      stockCounterparty({
        ...none,
        kind: "transfer_out",
        otherCentre: { id: "b", name: "Tambaram" },
      }),
    ).toBe("To Tambaram");
    expect(
      stockCounterparty({
        ...none,
        kind: "transfer_in",
        otherCentre: { id: "a", name: "Anna Nagar" },
      }),
    ).toBe("From Anna Nagar");
    expect(
      stockCounterparty({
        ...none,
        kind: "received",
        supplierName: "Sri Books",
        billNumber: "SB-101",
      }),
    ).toBe("Sri Books · Bill SB-101");
    expect(stockCounterparty({ ...none, kind: "adjusted" })).toBeNull();
  });

  it("finds the row a shortage is about, preferring the longest name", () => {
    const message = "Only 3 set of Nursery kit large in stock at this Centre.";
    expect(
      insufficientStockRow(message, [
        "Notebook",
        "Nursery kit",
        "Nursery kit large",
      ]),
    ).toBe(2);
    expect(insufficientStockRow(message, ["Crayons", null])).toBe(-1);
  });
});
