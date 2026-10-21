import type { PartyInvoicing } from "@/src/contracts/application/ports";

/**
 * Finance has no `ra_bill` invoice origin, retention-held entry kind or
 * `client` party type yet: they arrive with the bills (CM-1106 for
 * Contractor Bills, CM-1107 for Client Bills, ADR CM-0023 §7). Until then
 * nothing approves a bill, so a call here is a programming error.
 */
const NOT_YET =
  "PartyInvoicing arrives with CM-1106: finance cannot invoice an RA bill yet.";

/** How an approved RA bill becomes a finance invoice (ADR CM-0023 §7). */
export const contractsPartyInvoicing: PartyInvoicing = {
  create: () => Promise.reject(new Error(NOT_YET)),
  reverse: () => Promise.reject(new Error(NOT_YET)),
};
