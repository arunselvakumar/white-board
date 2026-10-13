import { describe, expect, it } from "vitest";

import { receiptGaps } from "./report-fees";

describe("Receipt register gaps (R10)", () => {
  it("flags numbers missing between the lowest and highest shown", () => {
    expect(
      receiptGaps(
        ["R-1041", "R-1042", "R-1044"],
        ["R-1040", "R-1041", "R-1042", "R-1044", "R-1045"],
      ),
    ).toEqual(["R-1043"]);
  });

  it("doesn't flag a Receipt that exists but was filtered out", () => {
    expect(
      receiptGaps(["R-0001", "R-0003"], ["R-0001", "R-0002", "R-0003"]),
    ).toEqual([]);
  });
});
