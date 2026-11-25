import { describe, expect, it } from "vitest";

import { cancelReason } from "./fee-payment";

describe("cancelReason", () => {
  it("trims the reason", () => {
    expect(cancelReason("  Cheque   bounced ")).toBe("Cheque bounced");
  });

  it("refuses a blank or overlong reason", () => {
    expect(() => cancelReason(" ")).toThrow(
      expect.objectContaining({ code: "FEE_PAYMENT_CANCEL_REASON_REQUIRED" }),
    );
    expect(() => cancelReason(null)).toThrow(
      expect.objectContaining({ code: "FEE_PAYMENT_CANCEL_REASON_REQUIRED" }),
    );
    expect(() => cancelReason("x".repeat(301))).toThrow(
      expect.objectContaining({ code: "FEE_PAYMENT_CANCEL_REASON_TOO_LONG" }),
    );
  });
});
