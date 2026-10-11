import { panHolderType } from "@/src/shared-kernel/tax-ids";

/**
 * Who a Contractor is for TDS under section 194C (ADR CM-0017 §8): the
 * PAN's fourth letter P (individual) or H (HUF) pays 1%, every other
 * holder 2%, and no PAN 20% (section 206AA). Finance holds the dated
 * rates; this is the label the master shows.
 */
export type TdsPayeeKind = "individual_huf" | "other" | "no_pan";

export const TDS_PAYEE_LABELS: Record<TdsPayeeKind, string> = {
  individual_huf: "Individual / HUF — 1%",
  other: "Firm/Company/other — 2%",
  no_pan: "No PAN — 20%",
};

export function tdsPayeeKind(pan: string | null): TdsPayeeKind {
  if (pan == null || pan.trim() === "") return "no_pan";
  const holder = panHolderType(pan);
  if (holder == null) return "no_pan";
  return holder === "individual" || holder === "huf"
    ? "individual_huf"
    : "other";
}
