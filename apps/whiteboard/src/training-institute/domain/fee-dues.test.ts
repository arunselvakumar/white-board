import { describe, expect, it } from "vitest";

import { assessFeeDues } from "./fee-dues";

const TODAY = "2026-10-09";

describe("assessFeeDues", () => {
  it("is due soon for an instalment due in 2 days, not one due in 5", () => {
    const inTwo = assessFeeDues({
      netAmountPaise: 100000,
      paidPaise: 0,
      dueDates: [{ dueOn: "2026-10-11", amountPaise: 100000 }],
      today: TODAY,
    });
    expect(inTwo.dueSoon).toBe(true);
    expect(inTwo.overdue).toBe(false);
    expect(inTwo.nextUnpaidDueOn).toBe("2026-10-11");

    const inFive = assessFeeDues({
      netAmountPaise: 100000,
      paidPaise: 0,
      dueDates: [{ dueOn: "2026-10-14", amountPaise: 100000 }],
      today: TODAY,
    });
    expect(inFive.dueSoon).toBe(false);
    expect(inFive.nextUnpaidDueOn).toBe("2026-10-14");
  });

  it("counts today and the third day ahead as due soon", () => {
    for (const dueOn of [TODAY, "2026-10-12"]) {
      expect(
        assessFeeDues({
          netAmountPaise: 5000,
          paidPaise: 0,
          dueDates: [{ dueOn, amountPaise: 5000 }],
          today: TODAY,
        }).dueSoon,
      ).toBe(true);
    }
  });

  it("is overdue when a due date passed last week with money owed", () => {
    const standing = assessFeeDues({
      netAmountPaise: 300000,
      paidPaise: 50000,
      dueDates: [
        { dueOn: "2026-10-02", amountPaise: 100000 },
        { dueOn: "2026-11-02", amountPaise: 200000 },
      ],
      today: TODAY,
    });
    expect(standing.overdue).toBe(true);
    expect(standing.overduePaise).toBe(50000);
    expect(standing.oldestUnpaidDueOn).toBe("2026-10-02");
    expect(standing.nextUnpaidDueOn).toBe("2026-11-02");
    expect(standing.remainingPaise).toBe(250000);
  });

  it("counts payments against the oldest due dates first", () => {
    const standing = assessFeeDues({
      netAmountPaise: 300000,
      paidPaise: 100000,
      dueDates: [
        { dueOn: "2026-11-01", amountPaise: 100000 },
        { dueOn: "2026-09-01", amountPaise: 100000 },
        { dueOn: "2026-10-10", amountPaise: 100000 },
      ],
      today: TODAY,
    });
    expect(standing.overdue).toBe(false);
    expect(standing.dueSoon).toBe(true);
    expect(standing.nextUnpaidDueOn).toBe("2026-10-10");
  });

  it("can be both overdue and due soon", () => {
    const standing = assessFeeDues({
      netAmountPaise: 200000,
      paidPaise: 0,
      dueDates: [
        { dueOn: "2026-10-01", amountPaise: 100000 },
        { dueOn: "2026-10-10", amountPaise: 100000 },
      ],
      today: TODAY,
    });
    expect(standing.overdue).toBe(true);
    expect(standing.dueSoon).toBe(true);
  });

  it("treats dates that don't add up as unclear: never overdue or due soon", () => {
    const standing = assessFeeDues({
      netAmountPaise: 80000,
      paidPaise: 0,
      dueDates: [{ dueOn: "2026-10-01", amountPaise: 100000 }],
      today: TODAY,
    });
    expect(standing.clarity).toBe("unclear");
    expect(standing.overdue).toBe(false);
    expect(standing.dueSoon).toBe(false);
    expect(standing.remainingPaise).toBe(80000);
  });

  it("has nothing due once the balance is paid", () => {
    const standing = assessFeeDues({
      netAmountPaise: 100000,
      paidPaise: 100000,
      dueDates: [{ dueOn: "2026-10-01", amountPaise: 100000 }],
      today: TODAY,
    });
    expect(standing.remainingPaise).toBe(0);
    expect(standing.overdue).toBe(false);
    expect(standing.dueSoon).toBe(false);
  });
});
