import { describe, expect, it } from "vitest";

import { feeFigures } from "./dashboard-handlers";
import { centreRoyalty } from "./royalty-handlers";

const HEADS = [
  { id: "tuition", name: "Tuition", royaltyBearing: true, sortOrder: 1 },
  { id: "uniform", name: "Uniform", royaltyBearing: false, sortOrder: 3 },
  { id: "kit", name: "Kit & books", royaltyBearing: false, sortOrder: 2 },
];

function allocation(centreId: string, feeHeadId: string, amountPaise: number) {
  return {
    centreId,
    paymentId: "p",
    receiptNumber: "R/1",
    receivedOn: "2026-11-05",
    childId: "c",
    childName: "Aadhya",
    feeHeadId,
    amountPaise,
  };
}

describe("centreRoyalty", () => {
  it("charges the rate on royalty-bearing collections only", () => {
    const view = centreRoyalty(
      {
        id: "b",
        name: "Branch",
        code: "BR",
        ownership: "franchised",
        status: "active",
        franchiseeName: "Priya",
        royaltyBps: 1000,
      },
      HEADS,
      [
        allocation("b", "tuition", 1_000_000),
        allocation("b", "uniform", 200_000),
        allocation("a", "tuition", 500_000),
      ],
    );
    expect(view).toMatchObject({
      royaltyBearingPaise: 1_000_000,
      otherPaise: 200_000,
      royaltyPaise: 100_000,
      royaltyPercent: 10,
    });
    expect(view.byFeeHead.map((head) => head.name)).toEqual([
      "Tuition",
      "Uniform",
    ]);
  });

  it("charges a Company-owned Centre nothing", () => {
    expect(
      centreRoyalty(
        {
          id: "a",
          name: "Main",
          code: "MN",
          ownership: "company_owned",
          status: "active",
          franchiseeName: null,
          royaltyBps: 1000,
        },
        HEADS,
        [allocation("a", "tuition", 500_000)],
      ).royaltyPaise,
    ).toBe(0);
  });
});

describe("feeFigures", () => {
  it("splits what is owed into due and overdue and ranks who owes most", () => {
    const invoice = (childId: string, dueOn: string, amountPaise: number) => ({
      childId,
      childName: childId,
      classroomName: null,
      dueOn,
      amountPaise,
      concessionPaise: 0,
      paidPaise: 0,
    });
    expect(
      feeFigures(
        [
          invoice("a", "2026-11-01", 100),
          invoice("b", "2026-11-20", 300),
          invoice("b", "2026-12-01", 50),
          invoice("c", "2026-11-25", 70),
        ],
        "2026-11-25",
      ),
    ).toEqual({
      duePaise: 520,
      overduePaise: 400,
      childrenWithDues: 3,
      topDues: [
        { childId: "b", name: "b", classroomName: null, overduePaise: 300 },
        { childId: "a", name: "a", classroomName: null, overduePaise: 100 },
      ],
    });
  });
});
