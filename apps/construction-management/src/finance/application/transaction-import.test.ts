import { describe, expect, it } from "vitest";

import {
  importAmount,
  importDate,
  importMode,
  importType,
} from "./transaction-import";

describe("Transactions import cells (CM-702)", () => {
  it("reads dates as Excel dates, ISO or DD/MM/YYYY", () => {
    expect(importDate(new Date(Date.UTC(2026, 9, 5)))).toBe("2026-10-05");
    expect(importDate("2026-10-05")).toBe("2026-10-05");
    expect(importDate("5/10/2026")).toBe("2026-10-05");
    expect(importDate("05-10-2026")).toBe("2026-10-05");
    expect(importDate("31/02/2026")).toBeNull();
    expect(importDate("tomorrow")).toBeNull();
    expect(importDate(null)).toBeNull();
  });

  it("reads rupees as paise without floating-point drift", () => {
    expect(importAmount(1200.5)).toBe(1_200_50n);
    expect(importAmount(0.1 + 0.2)).toBe(30n);
    expect(importAmount(12.345)).toBeNull();
    expect(importAmount("25,000")).toBe(25_000_00n);
    expect(importAmount("₹ 1,500.05")).toBe(1_500_05n);
    expect(importAmount("12.345")).toBeNull();
    expect(importAmount("-5")).toBeNull();
    expect(importAmount("abc")).toBeNull();
  });

  it("reads the type and the mode", () => {
    expect(importType("Payment In")).toBe("payment_in");
    expect(importType("payment-out")).toBe("payment_out");
    expect(importType("Out")).toBe("payment_out");
    expect(importType("Refund")).toBeNull();
    expect(importMode("UPI")).toBe("upi");
    expect(importMode("Check")).toBe("cheque");
    expect(importMode("NEFT")).toBeNull();
  });
});
