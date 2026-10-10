import { describe, expect, it } from "vitest";

import {
  closeReason,
  deriveMaterialRequestStatus,
  materialRequestLines,
  pendingQuantity,
} from "./material-request";

const CEMENT = "0199c4a0-0000-7000-8000-00000000a001";
const STEEL = "0199c4a0-0000-7000-8000-00000000a002";

describe("Material Request (CM-508)", () => {
  it("cleans lines and refuses empty, repeated and zero ones", () => {
    expect(
      materialRequestLines([{ materialId: CEMENT, askQty: "12.5", remark: " " }]),
    ).toEqual([{ materialId: CEMENT, askQty: "12.500", remark: null }]);
    expect(() => materialRequestLines([])).toThrow("Add at least one material.");
    expect(() =>
      materialRequestLines([
        { materialId: CEMENT, askQty: "1" },
        { materialId: CEMENT, askQty: "2" },
      ]),
    ).toThrow("once");
    expect(() =>
      materialRequestLines([{ materialId: STEEL, askQty: "0" }]),
    ).toThrow("more than 0");
    expect(() =>
      materialRequestLines([{ materialId: STEEL, askQty: "1.2345" }]),
    ).toThrow("3 decimals");
  });

  it("derives the status from delivered quantities only", () => {
    const line = (askQty: string, deliveredQty: string) => ({
      askQty,
      deliveredQty,
    });
    expect(deriveMaterialRequestStatus([line("8", "0")], false)).toBe(
      "requested",
    );
    expect(
      deriveMaterialRequestStatus([line("8", "8"), line("2", "1")], false),
    ).toBe("partially_delivered");
    expect(
      deriveMaterialRequestStatus([line("8", "8"), line("2", "2.5")], false),
    ).toBe("delivered");
    expect(deriveMaterialRequestStatus([line("8", "1")], true)).toBe("closed");
  });

  it("counts notes in flight as taken and never goes below zero", () => {
    expect(pendingQuantity("8", "2", "5")).toBe("1.000");
    expect(pendingQuantity("8", "6", "5")).toBe("0.000");
  });

  it("closes only an open request with no open note, with a reason", () => {
    expect(closeReason("partially_delivered", 0, " Out of stock ")).toBe(
      "Out of stock",
    );
    expect(() => closeReason("delivered", 0, "x")).toThrow("nothing left");
    expect(() => closeReason("requested", 1, "x")).toThrow("Deliver or delete");
    expect(() => closeReason("requested", 0, "")).toThrow();
  });
});
