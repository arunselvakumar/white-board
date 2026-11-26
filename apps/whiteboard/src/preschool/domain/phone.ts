import { invalid } from "./errors";

/**
 * The 10 digits of an Indian mobile number ("9876543210"), or null. Accepts
 * spaces, dashes, brackets and a `+91`, `91` or `0` prefix.
 */
export function normaliseIndianMobile(raw: string): string | null {
  const compact = raw.replace(/[\s\-().]/g, "");
  return /^(?:\+?91|0)?([6-9]\d{9})$/.exec(compact)?.[1] ?? null;
}

/** 400 `PHONE_INVALID` naming the field unless `raw` is an Indian mobile number. */
export function indianMobile(raw: string, field: string): string {
  const digits = normaliseIndianMobile(raw);
  if (digits == null)
    throw invalid("PHONE_INVALID", "Enter a 10-digit Indian mobile number.", {
      field,
    });
  return digits;
}

/** Blank is null; anything else must be an Indian mobile number. */
export function optionalIndianMobile(
  raw: string | null | undefined,
  field: string,
): string | null {
  if (raw == null || raw.trim() === "") return null;
  return indianMobile(raw, field);
}
