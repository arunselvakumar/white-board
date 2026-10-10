import { describe, expect, it } from "vitest";

import {
  assertDeliverable,
  deliveryNoteLines,
  deliveryNoteStatus,
  type RequestLineAvailability,
} from "./delivery-note";

const LINE = "0199c4a0-0000-7000-8000-0000000000d1";
const available = new Map<string, RequestLineAvailability>([
  [
    LINE,
    {
      id: LINE,
      materialId: "0199c4a0-0000-7000-8000-00000000a001",
      materialName: "Cement",
      pendingQty: "5.000",
      storeStock: "3.000",
    },
  ],
]);

describe("Delivery Note (CM-508)", () => {
  it("is pending, in transit once approved, delivered once received", () => {
    expect(
      deliveryNoteStatus({ approvalStatus: "pending", deliveredAt: null }),
    ).toBe("pending");
    expect(
      deliveryNoteStatus({ approvalStatus: "approved", deliveredAt: null }),
    ).toBe("in_transit");
    expect(
      deliveryNoteStatus({ approvalStatus: "approved", deliveredAt: new Date() }),
    ).toBe("delivered");
  });

  it("sends at most what is pending and what the store holds", () => {
    expect(
      deliveryNoteLines([{ materialRequestItemId: LINE, quantity: "2" }], available),
    ).toEqual([
      {
        materialRequestItemId: LINE,
        materialId: "0199c4a0-0000-7000-8000-00000000a001",
        quantity: "2.000",
      },
    ]);
    expect(() =>
      deliveryNoteLines([{ materialRequestItemId: LINE, quantity: "6" }], available),
    ).toThrow("Only 5 of Cement is still pending");
    expect(() =>
      deliveryNoteLines([{ materialRequestItemId: LINE, quantity: "4" }], available),
    ).toThrow("The store has only 3 of Cement");
    expect(() => deliveryNoteLines([], available)).toThrow();
  });

  it("is delivered only in transit and not before its date", () => {
    expect(() => assertDeliverable("pending", "2026-10-01", "2026-10-02")).toThrow(
      "Approve",
    );
    expect(() =>
      assertDeliverable("in_transit", "2026-10-02", "2026-10-01"),
    ).toThrow("before");
    expect(() =>
      assertDeliverable("in_transit", "2026-10-02", "2026-10-02"),
    ).not.toThrow();
  });
});
