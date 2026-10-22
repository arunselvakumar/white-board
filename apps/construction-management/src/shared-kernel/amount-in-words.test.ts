import { describe, expect, it } from "vitest";

import { indianNumberWords, rupeesInWords } from "./amount-in-words";

describe("amount in words, Indian numbering (CM-1107 tax invoice)", () => {
  it("writes lakh and thousand as an Indian invoice does", () => {
    expect(rupeesInWords(7_20_460_00n)).toBe(
      "Rupees Seven Lakh Twenty Thousand Four Hundred Sixty Only",
    );
  });

  it("writes crores and paise", () => {
    expect(rupeesInWords(1_23_45_678_50n)).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only",
    );
    expect(indianNumberWords(0n)).toBe("Zero");
    expect(indianNumberWords(1_00_000n)).toBe("One Lakh");
  });
});
