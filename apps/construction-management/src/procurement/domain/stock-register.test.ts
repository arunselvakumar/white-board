import { describe, expect, it } from "vitest";

import { stockRegisterRow } from "./stock-register";

describe("stockRegisterRow (CM-506)", () => {
  it("shows outflows as positive figures and closes on the sum", () => {
    expect(
      stockRegisterRow("100.000", {
        received: "50.000",
        transferred_in: "10.000",
        transferred_out: "-20.000",
        issued: "-5.000",
        received_from_store: "4.000",
        consumed: "-30.500",
        missing: "-1.000",
        adjustment: "-2.000",
      }),
    ).toEqual({
      opening: "100.000",
      received: "50.000",
      transferredIn: "10.000",
      transferredOut: "20.000",
      issued: "5.000",
      receivedFromStore: "4.000",
      consumed: "30.500",
      missing: "1.000",
      adjustment: "-2.000",
      closing: "105.500",
    });
  });

  it("counts opening stock posted in the range towards Opening", () => {
    const row = stockRegisterRow("0", { opening: "40", consumed: "-10" });
    expect(row.opening).toBe("40.000");
    expect(row.consumed).toBe("10.000");
    expect(row.closing).toBe("30.000");
    expect(row.received).toBe("0.000");
  });
});
