import { describe, expect, it } from "vitest";

import {
  annualAmountPaise,
  assertStructureLines,
  feeHeadName,
  type StructureLineInput,
} from "./fee-structure";

const tuition: StructureLineInput = {
  feeHeadId: "t",
  feeHeadName: "Tuition",
  kind: "recurring",
  amountPaise: 300_000,
  frequency: "monthly",
};

const admission: StructureLineInput = {
  feeHeadId: "a",
  feeHeadName: "Admission fee",
  kind: "one_time",
  amountPaise: 1_000_000,
  frequency: "one_time",
};

describe("assertStructureLines", () => {
  it("accepts each kind at the frequencies it allows", () => {
    expect(() => {
      assertStructureLines([
        tuition,
        { ...tuition, feeHeadId: "t2", frequency: "annual" },
        admission,
        { ...admission, feeHeadId: "a2", frequency: "annual", amountPaise: 0 },
      ]);
    }).not.toThrow();
  });

  it("refuses a one-time head charged monthly, and a recurring head charged once", () => {
    expect(() => {
      assertStructureLines([{ ...admission, frequency: "monthly" }]);
    }).toThrow(expect.objectContaining({ code: "FEE_FREQUENCY_INVALID" }));
    expect(() => {
      assertStructureLines([{ ...tuition, frequency: "one_time" }]);
    }).toThrow(expect.objectContaining({ code: "FEE_FREQUENCY_INVALID" }));
  });

  it("refuses a repeated head and an amount that is not whole paise of zero or more", () => {
    expect(() => {
      assertStructureLines([tuition, tuition]);
    }).toThrow(
      expect.objectContaining({ code: "FEE_STRUCTURE_DUPLICATE_HEAD" }),
    );
    expect(() => {
      assertStructureLines([{ ...tuition, amountPaise: -1 }]);
    }).toThrow(expect.objectContaining({ code: "FEE_AMOUNT_INVALID" }));
    expect(() => {
      assertStructureLines([{ ...tuition, amountPaise: 10.5 }]);
    }).toThrow(expect.objectContaining({ code: "FEE_AMOUNT_INVALID" }));
  });
});

describe("annualAmountPaise", () => {
  it("multiplies each line by its instalments in a year", () => {
    expect(
      annualAmountPaise([
        { amountPaise: 100, frequency: "monthly" },
        { amountPaise: 100, frequency: "quarterly" },
        { amountPaise: 100, frequency: "term" },
        { amountPaise: 100, frequency: "annual" },
        { amountPaise: 100, frequency: "one_time" },
      ]),
    ).toBe(1200 + 400 + 300 + 100 + 100);
  });
});

describe("feeHeadName", () => {
  it("trims and refuses an empty name", () => {
    expect(feeHeadName("  Field   trip ")).toBe("Field trip");
    expect(() => feeHeadName(" ")).toThrow(
      expect.objectContaining({ code: "FEE_HEAD_NAME_REQUIRED" }),
    );
  });
});
