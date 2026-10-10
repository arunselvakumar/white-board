import { describe, expect, it } from "vitest";

import { InMemoryStatutoryRates } from "./in-memory-statutory-rates";
import { NoLeaveDaySource } from "./stub-ports";

const COMPANY = "company-1";

describe("stand-in ports", () => {
  it("have no approved leave until CM-312", async () => {
    const leave = await new NoLeaveDaySource().approvedForMonth(
      COMPANY,
      ["m1"],
      "2026-10",
    );
    expect(leave.get("m1")).toEqual([]);
  });

  it("answer statutory figures from rows in memory", async () => {
    const rates = new InMemoryStatutoryRates({
      pf: [
        {
          effectiveFrom: "2014-09-01",
          wageCeiling: 1_500_000,
          employeePercent: "12.00",
          employerPercent: "12.00",
          epsPercent: "8.33",
          source: "test",
        },
      ],
      esi: [],
      pt: [
        {
          stateCode: "29",
          effectiveFrom: "2025-04-01",
          appliesTo: "everyone",
          grossFrom: 2_500_000,
          grossTo: null,
          monthlyAmount: 20_000,
          specialMonth: 2,
          specialMonthAmount: 30_000,
          source: "test",
        },
      ],
    });
    expect((await rates.pfFor("2026-10"))?.wageCeiling).toBe(1_500_000);
    expect(await rates.esiFor("2026-10")).toBeNull();
    expect((await rates.ptFor("29", "2027-02", 3_000_000)).amount).toBe(30_000);
    expect((await rates.ptFor("29", "2026-10", 2_499_999)).amount).toBe(0);
  });
});
