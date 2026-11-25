import { invalid } from "./errors";

/** Why a Fee Payment is cancelled: required, trimmed, at most 300 characters. */
export function cancelReason(reason: string | null | undefined): string {
  const trimmed = reason?.trim().replace(/\s+/g, " ") ?? "";
  if (trimmed === "")
    throw invalid(
      "FEE_PAYMENT_CANCEL_REASON_REQUIRED",
      "Say why the Receipt is cancelled, such as a wrong amount.",
    );
  if (trimmed.length > 300)
    throw invalid(
      "FEE_PAYMENT_CANCEL_REASON_TOO_LONG",
      "A reason can be at most 300 characters.",
    );
  return trimmed;
}
