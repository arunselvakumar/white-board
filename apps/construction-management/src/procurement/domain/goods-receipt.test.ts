import { describe, expect, it } from "vitest";

import {
  addQuantities,
  assertReceiptDates,
  driverMobile,
  EMPTY_DETAILS,
  ewayBillNo,
  excessQuantity,
  goodsReceiptDetails,
  netUnitRate,
  pendingQuantity,
  receiptLineAmounts,
  receiptStatus,
  receiptTotals,
  receivedQuantity,
} from "./goods-receipt";

describe("Goods Receipt rules (CM-505)", () => {
  it("derives a PO's receipt status from ordered and received", () => {
    expect(receiptStatus([])).toBe("not_received");
    expect(
      receiptStatus([
        { ordered: "100.000", received: "0.000" },
        { ordered: "50.000", received: "0.000" },
      ]),
    ).toBe("not_received");
    expect(
      receiptStatus([
        { ordered: "100.000", received: "60.000" },
        { ordered: "50.000", received: "0.000" },
      ]),
    ).toBe("partially_received");
    // An excess on one line does not make up for another short line.
    expect(
      receiptStatus([
        { ordered: "100.000", received: "140.000" },
        { ordered: "50.000", received: "49.999" },
      ]),
    ).toBe("partially_received");
    expect(
      receiptStatus([
        { ordered: "100.000", received: "110.000" },
        { ordered: "50.000", received: "50.000" },
      ]),
    ).toBe("received");
  });

  it("measures excess and pending exactly", () => {
    expect(excessQuantity("100.000", "110.500")).toBe("10.500");
    expect(excessQuantity("100.000", "100.000")).toBeNull();
    expect(pendingQuantity("100.000", "60.250")).toBe("39.750");
    expect(pendingQuantity("100.000", "120.000")).toBe("0.000");
    expect(addQuantities("0.001", "99999999999.999")).toBe("100000000000.000");
  });

  it("takes the PO line's taxable value per unit as the GRN rate", () => {
    // 50 × ₹60 less 10% = ₹2,700: ₹54 a unit.
    expect(netUnitRate({ quantity: "50.000", taxable: 270_000n })).toBe(5_400n);
    // ₹100 over 3 units rounds half up to the paisa.
    expect(netUnitRate({ quantity: "3.000", taxable: 10_000n })).toBe(3_333n);
  });

  it("prices a line without a discount and totals the GRN value", () => {
    const intra = receiptLineAmounts(
      { quantity: "60", unitRate: 40_000n, gstRate: "28" },
      "intra_state",
    );
    expect(intra).toMatchObject({
      taxable: 2_400_000n,
      cgst: 336_000n,
      sgst: 336_000n,
      igst: 0n,
      total: 3_072_000n,
    });
    const inter = receiptLineAmounts(
      { quantity: "0.333", unitRate: 1_001n, gstRate: "5" },
      "inter_state",
    );
    expect(inter).toMatchObject({ taxable: 333n, igst: 17n, total: 350n });
    expect(receiptTotals([intra, inter])).toEqual({
      taxableTotal: 2_400_333n,
      cgstTotal: 336_000n,
      sgstTotal: 336_000n,
      igstTotal: 17n,
      totalValue: 3_072_350n,
    });
  });

  it("checks quantities", () => {
    expect(receivedQuantity("12.5")).toBe("12.500");
    expect(() => receivedQuantity("0")).toThrow(
      expect.objectContaining({ code: "QUANTITY_INVALID" }),
    );
    expect(() => receivedQuantity("1.0001")).toThrow(
      expect.objectContaining({ code: "QUANTITY_INVALID" }),
    );
  });

  it("keeps GR and Inventory dates in order and not in the future", () => {
    expect(() => {
      assertReceiptDates("2026-10-08", "2026-10-09", "2026-10-10");
    }).not.toThrow();
    expect(() => {
      assertReceiptDates("2026-10-11", "2026-10-11", "2026-10-10");
    }).toThrow(
      expect.objectContaining({ code: "GOODS_RECEIPT_DATE_IN_FUTURE" }),
    );
    expect(() => {
      assertReceiptDates("2026-10-08", "2026-10-11", "2026-10-10");
    }).toThrow(expect.objectContaining({ code: "INVENTORY_DATE_IN_FUTURE" }));
    expect(() => {
      assertReceiptDates("2026-10-08", "2026-10-07", "2026-10-10");
    }).toThrow(
      expect.objectContaining({ code: "INVENTORY_DATE_BEFORE_RECEIPT" }),
    );
  });

  it("reads driver mobiles and e-way bill numbers", () => {
    expect(driverMobile("77081 65767")).toBe("+917708165767");
    expect(driverMobile("+91 98765 43210")).toBe("+919876543210");
    expect(driverMobile("  ")).toBeNull();
    expect(() => driverMobile("+1 415 555 0100")).toThrow(
      expect.objectContaining({ code: "DRIVER_MOBILE_INVALID" }),
    );
    expect(ewayBillNo("1234 5678 9012")).toBe("123456789012");
    expect(() => ewayBillNo("12345")).toThrow(
      expect.objectContaining({ code: "EWAY_BILL_NO_INVALID" }),
    );
  });

  it("keeps hidden fields and, without Financial, the invoice amount as stored", () => {
    const stored = {
      ...EMPTY_DETAILS,
      vehicleNo: "TN 09 AB 1234",
      invoiceAmount: 500_000n,
    };
    const details = goodsReceiptDetails(
      {
        vehicleNo: "KA 01 ZZ 9999",
        invoiceAmount: 1,
        invoiceNo: "  SMT/118 ",
        remark: "",
      },
      { hidden: new Set(["vehicleNo"]), financial: false, stored },
    );
    expect(details).toMatchObject({
      vehicleNo: "TN 09 AB 1234",
      invoiceAmount: 500_000n,
      invoiceNo: "SMT/118",
      remark: null,
    });
    const fresh = goodsReceiptDetails(
      { vehicleNo: "tn 09  ab 1234", invoiceAmount: 3_400_000 },
      { hidden: new Set(), financial: true, stored: null },
    );
    expect(fresh).toMatchObject({
      vehicleNo: "TN 09 AB 1234",
      invoiceAmount: 3_400_000n,
    });
    expect(() =>
      goodsReceiptDetails(
        { grnDcNo: "x".repeat(101) },
        { hidden: new Set(), financial: true, stored: null },
      ),
    ).toThrow(expect.objectContaining({ code: "TEXT_TOO_LONG" }));
  });
});
