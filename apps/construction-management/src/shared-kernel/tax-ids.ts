/**
 * Indian tax identifiers (`modules/01` rebuild recommendation 7). Format
 * checks only; nothing here calls the GST or Income Tax portals.
 */

const GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_SHAPE = /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/;

/** The 15th character of a GSTIN: a base-36 Luhn-style check digit. */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    const value = GSTIN_CHARSET.indexOf(first14.charAt(index));
    const product = value * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARSET.charAt((36 - (sum % 36)) % 36);
}

/** State code 01–38, an embedded valid PAN, and the check character. */
export function isValidGstin(raw: string): boolean {
  const value = raw.trim().toUpperCase();
  if (!GSTIN_SHAPE.test(value)) return false;
  const state = Number(value.slice(0, 2));
  if (state < 1 || state > 38) return false;
  if (!isValidPan(value.slice(2, 12))) return false;
  return gstinCheckCharacter(value.slice(0, 14)) === value.charAt(14);
}

/** Five letters (the 4th is the holder type), four digits, one letter. */
export function isValidPan(raw: string): boolean {
  return PAN_SHAPE.test(raw.trim().toUpperCase());
}

export type PanHolderType =
  | "individual"
  | "company"
  | "firm"
  | "huf"
  | "aop"
  | "trust"
  | "body_of_individuals"
  | "local_authority"
  | "artificial_juridical_person"
  | "government";

const HOLDER_TYPES: Record<string, PanHolderType> = {
  P: "individual",
  C: "company",
  F: "firm",
  H: "huf",
  A: "aop",
  T: "trust",
  B: "body_of_individuals",
  L: "local_authority",
  J: "artificial_juridical_person",
  G: "government",
};

/** The PAN holder type (TDS rates depend on it: 194C is 1% for P/H). */
export function panHolderType(pan: string): PanHolderType | null {
  return HOLDER_TYPES[pan.trim().toUpperCase().charAt(3)] ?? null;
}

/** `AAPFA0939F` → `XXXXXX939F`: the last four characters stay visible. */
export function maskIdentifier(value: string, visible = 4): string {
  if (value.length <= visible) return value;
  return `${"X".repeat(value.length - visible)}${value.slice(-visible)}`;
}

// Verhoeff tables (dihedral group D5) for the Aadhaar check digit.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

function verhoeffValid(digits: string): boolean {
  let check = 0;
  const reversed = digits.split("").reverse();
  for (let index = 0; index < reversed.length; index += 1) {
    const digit = Number(reversed[index]);
    const permuted = VERHOEFF_P[index % 8]?.[digit] ?? 0;
    check = VERHOEFF_D[check]?.[permuted] ?? 0;
  }
  return check === 0;
}

/** Twelve digits, not starting with 0 or 1, with a valid Verhoeff check digit. */
export function isValidAadhaar(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, "");
  return /^[2-9]\d{11}$/.test(digits) && verhoeffValid(digits);
}

export function normalizeAadhaar(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}
