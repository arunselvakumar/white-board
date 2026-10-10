/**
 * A rupee amount in words with Indian numbering (lakh, crore), as printed
 * under a Purchase Order's grand total: 1,23,45,678.50 →
 * "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred
 * Seventy Eight and Fifty Paise Only".
 */

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
];

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
];

function belowHundred(value: number): string {
  if (value < 20) return ONES[value] ?? "";
  const tens = TENS[Math.floor(value / 10)] ?? "";
  const ones = value % 10;
  return ones === 0 ? tens : `${tens} ${ONES[ones] ?? ""}`;
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds] ?? ""} Hundred`);
  if (rest > 0) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** Whole rupees in words, Indian grouping; crores repeat above 99 crore. */
export function indianNumberWords(value: bigint): string {
  if (value < 0n) return `Minus ${indianNumberWords(-value)}`;
  if (value === 0n) return "Zero";
  const crore = value / 10_000_000n;
  let rest = Number(value % 10_000_000n);
  const parts: string[] = [];
  if (crore > 0n) parts.push(`${indianNumberWords(crore)} Crore`);
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (lakh > 0) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(" ");
}

export function rupeesInWords(paise: bigint): string {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const rupees = absolute / 100n;
  const remainder = Number(absolute % 100n);
  const words = `Rupees ${indianNumberWords(rupees)}${
    remainder > 0 ? ` and ${belowHundred(remainder)} Paise` : ""
  } Only`;
  return negative ? `Minus ${words}` : words;
}
