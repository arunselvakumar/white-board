import { describe, expect, it } from "vitest";

import {
  approve,
  bulkIds,
  optionalText,
  pendingState,
  reject,
  requiredText,
} from "./approval";

const naming = { code: "PURCHASE_ORDER", label: "Purchase Order" };
const by = { userId: "u1", at: new Date("2026-10-10T05:00:00Z") };

describe("approval", () => {
  it("approves or rejects a pending document once", () => {
    const approved = approve(pendingState(), by, naming);
    expect(approved).toEqual({
      status: "approved",
      decidedAt: by.at,
      decidedBy: "u1",
      rejectionReason: null,
    });
    expect(() => approve(approved, by, naming)).toThrow(
      expect.objectContaining({
        code: "PURCHASE_ORDER_NOT_PENDING",
        kind: "conflict",
      }),
    );
    const rejected = reject(pendingState(), by, "  Rate too high ", naming);
    expect(rejected.rejectionReason).toBe("Rate too high");
    expect(() => reject(rejected, by, "again", naming)).toThrow(
      expect.objectContaining({ code: "PURCHASE_ORDER_NOT_PENDING" }),
    );
  });

  it("needs a reason to reject, and caps text at 500", () => {
    expect(() => reject(pendingState(), by, "   ", naming)).toThrow(
      expect.objectContaining({ code: "REJECTION_REASON_REQUIRED" }),
    );
    expect(() => requiredText("x".repeat(501), "X", "remark")).toThrow(
      expect.objectContaining({ code: "TEXT_TOO_LONG" }),
    );
    expect(optionalText("  ", "remark")).toBeNull();
  });

  it("takes 1–100 distinct ids in bulk", () => {
    expect(bulkIds(["a", "a", "b"])).toEqual(["a", "b"]);
    expect(() => bulkIds([])).toThrow(
      expect.objectContaining({ code: "BULK_EMPTY" }),
    );
    expect(() =>
      bulkIds(Array.from({ length: 101 }, (_, i) => String(i))),
    ).toThrow(expect.objectContaining({ code: "BULK_TOO_MANY" }));
  });
});
