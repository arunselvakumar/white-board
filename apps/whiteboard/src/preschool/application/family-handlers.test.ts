import { describe, expect, it } from "vitest";

import { familyFees } from "./family-handlers";

const invoice = (
  label: string,
  dueOn: string,
  amountPaise: number,
  paidPaise = 0,
) => ({ label, dueOn, amountPaise, concessionPaise: 0, paidPaise });

describe("familyFees", () => {
  it("splits what is owed and names the next amount due", () => {
    expect(
      familyFees(
        [
          invoice("January", "2027-01-01", 300),
          invoice("October", "2026-10-01", 500, 200),
          invoice("December", "2026-12-01", 300),
          invoice("November", "2026-11-01", 400, 400),
        ],
        "2026-11-25",
      ),
    ).toEqual({
      duePaise: 900,
      overduePaise: 300,
      nextDue: { dueOn: "2026-12-01", label: "December", duePaise: 300 },
    });
  });

  it("is zero with nothing owed", () => {
    expect(familyFees([], "2026-11-25")).toEqual({
      duePaise: 0,
      overduePaise: 0,
      nextDue: null,
    });
  });
});
