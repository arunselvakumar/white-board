import { describe, expect, it } from "vitest";

import {
  formatPaiseAsRupees,
  paiseToRupeesInput,
  parseRupeesInput,
  rupeesToPaise,
} from "./money";

describe("money", () => {
  it("converts rupees to paise", () => {
    expect(rupeesToPaise(5000)).toBe(500000);
    expect(rupeesToPaise(12.5)).toBe(1250);
  });

  it("formats paise as rupees for display and inputs", () => {
    expect(formatPaiseAsRupees(500000)).toBe("₹5,000");
    expect(paiseToRupeesInput(500000)).toBe("5000");
    expect(paiseToRupeesInput(1250)).toBe("12.50");
  });

  it("parses a rupees input to paise", () => {
    expect(parseRupeesInput("5000")).toBe(500000);
    expect(parseRupeesInput("12.5")).toBe(1250);
    expect(parseRupeesInput("  ")).toBeNull();
    expect(parseRupeesInput("12.345")).toBeNull();
  });
});
