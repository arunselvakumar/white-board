import { describe, expect, it } from "vitest";

import { monthlyFlows, monthsBetween } from "./payment-flows";

describe("payment flows", () => {
  it("lists every month of a duration across a year end", () => {
    expect(monthsBetween("2026-11-15", "2027-02-01")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(monthsBetween("2026-10-01", "2026-10-31")).toEqual(["2026-10"]);
  });

  it("fills empty months and runs the balance from before the duration", () => {
    expect(
      monthlyFlows(
        ["2026-08", "2026-09", "2026-10"],
        [
          { month: "2026-08", in: 100n, out: 30n },
          { month: "2026-10", in: 0n, out: 50n },
        ],
        20n,
      ),
    ).toEqual([
      { month: "2026-08", in: 100n, out: 30n, net: 70n, balance: 90n },
      { month: "2026-09", in: 0n, out: 0n, net: 0n, balance: 90n },
      { month: "2026-10", in: 0n, out: 50n, net: -50n, balance: 40n },
    ]);
  });
});
