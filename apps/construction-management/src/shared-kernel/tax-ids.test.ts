import { describe, expect, it } from "vitest";

import {
  isValidAadhaar,
  gstinCheckCharacter,
  isValidGstin,
  isValidPan,
  maskIdentifier,
  panHolderType,
} from "./tax-ids";

describe("GSTIN", () => {
  it("accepts a GSTIN whose check character matches", () => {
    expect(isValidGstin("33AAPFA0939F1ZM")).toBe(true);
    expect(isValidGstin(" 33aapfa0939f1zm ")).toBe(true);
  });

  it("rejects a wrong check character, state or shape", () => {
    expect(isValidGstin("33AAPFA0939F1ZW")).toBe(false);
    expect(isValidGstin("99AAPFA0939F1ZM")).toBe(false);
    expect(isValidGstin("27AAPFA0939F1Z")).toBe(false);
    expect(isValidGstin("33AAPXA0939F1ZM")).toBe(false);
  });

  it("computes the check character", () => {
    expect(gstinCheckCharacter("33AAPFA0939F1Z")).toBe("M");
  });
});

describe("PAN", () => {
  it("validates the shape and holder type", () => {
    expect(isValidPan("AAPFA0939F")).toBe(true);
    expect(isValidPan("AAPXU0939F")).toBe(false);
    expect(isValidPan("AAPFU093F")).toBe(false);
    expect(panHolderType("ABCPE1234F")).toBe("individual");
    expect(panHolderType("AAPFA0939F")).toBe("firm");
  });

  it("masks all but the last four characters", () => {
    expect(maskIdentifier("AAPFA0939F")).toBe("XXXXXX939F");
    expect(maskIdentifier("123412341234")).toBe("XXXXXXXX1234");
  });
});

describe("Aadhaar", () => {
  it("checks the Verhoeff digit", () => {
    expect(isValidAadhaar("2341 2341 2346")).toBe(true);
    expect(isValidAadhaar("987654321096")).toBe(true);
    expect(isValidAadhaar("234123412345")).toBe(false);
    expect(isValidAadhaar("134123412346")).toBe(false);
    expect(isValidAadhaar("23412341234")).toBe(false);
  });
});
