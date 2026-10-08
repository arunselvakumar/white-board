import type { Seller } from "../domain/subscription-order";

/**
 * Who sells the subscription, printed on every tax invoice and copied onto
 * each order. Set the `CONSTRUCTION_SELLER_*` variables in production; the
 * defaults are placeholders. The state code decides CGST+SGST (same state
 * as the buyer) or IGST; it defaults to 27 Maharashtra.
 */
export function sellerFromEnv(): Seller {
  const env = (name: string, fallback: string) => {
    const value = process.env[name]?.trim();
    return value == null || value === "" ? fallback : value;
  };
  const gstin = env("CONSTRUCTION_SELLER_GSTIN", "");
  return {
    name: env("CONSTRUCTION_SELLER_NAME", "Construction Management"),
    address: env("CONSTRUCTION_SELLER_ADDRESS", "Pune, Maharashtra, India"),
    stateCode: env("CONSTRUCTION_SELLER_STATE_CODE", "27"),
    gstin: gstin === "" ? null : gstin,
    // SAC 997331: licensing services for the right to use software.
    sacCode: env("CONSTRUCTION_SELLER_SAC", "997331"),
  };
}
