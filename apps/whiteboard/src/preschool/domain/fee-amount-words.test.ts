import { describe, expect, it } from "vitest";

import { numberInIndianWords, rupeesInWords } from "./fee-amount-words";

describe("rupeesInWords", () => {
  it("writes a Receipt amount", () => {
    expect(rupeesInWords(1_250_000)).toBe(
      "Rupees Twelve Thousand Five Hundred Only",
    );
    expect(rupeesInWords(1050)).toBe("Rupees Ten and Fifty Paise Only");
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
    expect(rupeesInWords(5)).toBe("Rupees Zero and Five Paise Only");
  });

  it("refuses fractions and negatives", () => {
    expect(() => rupeesInWords(-1)).toThrow(RangeError);
    expect(() => rupeesInWords(1.5)).toThrow(RangeError);
  });
});

describe("numberInIndianWords", () => {
  it.each([
    [1, "One"],
    [15, "Fifteen"],
    [40, "Forty"],
    [99, "Ninety Nine"],
    [100, "One Hundred"],
    [101, "One Hundred One"],
    [1000, "One Thousand"],
    [21_045, "Twenty One Thousand Forty Five"],
    [100_000, "One Lakh"],
    [250_000, "Two Lakh Fifty Thousand"],
    [1_234_567, "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven"],
    [10_000_000, "One Crore"],
    [
      123_456_789,
      "Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine",
    ],
    [1_000_000_000, "One Hundred Crore"],
  ])("writes %i as %s", (n, words) => {
    expect(numberInIndianWords(n)).toBe(words);
  });
});
