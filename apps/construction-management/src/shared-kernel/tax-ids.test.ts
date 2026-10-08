import { describe, expect, it } from "vitest";

import {
  gstinCheckCharacter,
  isValidGstin,
  isValidPan,
  maskIdentifier,
  panHolderType,
} from "./tax-ids";

describe("GSTIN", () => {
  it("accepts a GSTIN whose check character matches", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin(" 27aapfu0939f1zv ")).toBe(true);
  });

  it("rejects a wrong check character, state or shape", () => {
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
    expect(isValidGstin("99AAPFU0939F1ZV")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("27AAPXU0939F1ZV")).toBe(false);
  });

  it("computes the check character", () => {
    expect(gstinCheckCharacter("27AAPFU0939F1Z")).toBe("V");
  });
});

describe("PAN", () => {
  it("validates the shape and holder type", () => {
    expect(isValidPan("AAPFU0939F")).toBe(true);
    expect(isValidPan("AAPXU0939F")).toBe(false);
    expect(isValidPan("AAPFU093F")).toBe(false);
    expect(panHolderType("ABCPE1234F")).toBe("individual");
    expect(panHolderType("AAPFU0939F")).toBe("firm");
  });

  it("masks all but the last four characters", () => {
    expect(maskIdentifier("AAPFU0939F")).toBe("XXXXXX939F");
    expect(maskIdentifier("123412341234")).toBe("XXXXXXXX1234");
  });
});
