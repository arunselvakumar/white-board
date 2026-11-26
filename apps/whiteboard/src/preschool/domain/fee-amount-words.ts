const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const;

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
] as const;

/** 1–99 */
function belowHundred(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const ones = n % 10;
  const tens = TENS[Math.floor(n / 10)] ?? "";
  return ones === 0 ? tens : `${tens} ${ONES[ones] ?? ""}`;
}

/** 1–999 */
function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds] ?? ""} Hundred`);
  if (rest > 0) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** A whole number in words, grouped the Indian way: crore, lakh, thousand. */
export function numberInIndianWords(n: number): string {
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError("Expected a whole number of zero or more.");
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore > 0) parts.push(`${numberInIndianWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/**
 * An amount as a Receipt writes it: "Rupees Twelve Thousand Five Hundred
 * Only", or "Rupees Ten and Fifty Paise Only".
 */
export function rupeesInWords(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0)
    throw new RangeError("Expected whole paise of zero or more.");
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  const words = `Rupees ${numberInIndianWords(rupees)}`;
  return rest === 0
    ? `${words} Only`
    : `${words} and ${belowHundred(rest)} Paise Only`;
}
