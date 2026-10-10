import { describe, expect, it } from "vitest";

import { rupeesInWords } from "./purchase-order-amount-words";
import {
  closeReason,
  deliveryAddress,
  editedApproval,
  hsnCode,
  placeOfSupply,
  pointOfContact,
  purchaseOrderLines,
  purchaseOrderTotals,
  supplyTypeFor,
  assertCanMarkPurchaseOrderOrdered,
  assertPurchaseOrderDeletable,
  type PurchaseOrderState,
} from "./purchase-order";
import type { LineMaterial } from "./purchase-request";

const CEMENT: LineMaterial = {
  id: "0199c4a0-0000-7000-8000-00000000a001",
  name: "Cement OPC 53 Grade",
  uomId: "0199c4a0-0000-7000-8000-00000000b001",
  uomName: "Bag",
  categoryId: null,
  disabled: false,
};
const STEEL: LineMaterial = {
  ...CEMENT,
  id: "0199c4a0-0000-7000-8000-00000000a002",
  name: "TMT Steel Bar 12 mm",
  uomName: "kg",
};
const materials = new Map([CEMENT, STEEL].map((m) => [m.id, m]));

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("purchase order tax math (golden)", () => {
  const inputs = [
    {
      materialId: CEMENT.id,
      quantity: "100",
      unitRate: 38_500n,
      gstRate: "28",
      hsnCode: "2523",
    },
    {
      materialId: STEEL.id,
      quantity: "1250.5",
      unitRate: 6_250n,
      discount: { type: "percent" as const, percent: "2" },
      gstRate: "18",
      hsnCode: "7214",
    },
  ];

  it("splits CGST and SGST within a state, CGST taking the odd paisa", () => {
    const lines = purchaseOrderLines(inputs, materials, "intra_state");
    // Cement: 100 × ₹385 = ₹38,500; GST 28% = ₹10,780.
    expect(lines[0]).toMatchObject({
      subTotal: 3_850_000n,
      discountAmount: 0n,
      taxable: 3_850_000n,
      cgst: 539_000n,
      sgst: 539_000n,
      igst: 0n,
      total: 4_928_000n,
      gstRate: "28.00",
      discountPercent: null,
    });
    // Steel: 1250.5 × ₹62.50 = ₹78,156.25; 2% = ₹1,563.13 (half up);
    // taxable ₹76,593.12; GST 18% = ₹13,786.76 → 6,893.38 each.
    expect(lines[1]).toMatchObject({
      subTotal: 7_815_625n,
      discountAmount: 156_313n,
      taxable: 7_659_312n,
      cgst: 689_338n,
      sgst: 689_338n,
      total: 9_037_988n,
      discountType: "percent",
      discountPercent: "2.00",
    });
    const totals = purchaseOrderTotals(lines, {
      additionalCharges: 150_000n,
      deductionAmount: 50_000n,
    });
    expect(totals).toMatchObject({
      subTotal: 11_665_625n,
      discountTotal: 156_313n,
      taxableTotal: 11_509_312n,
      cgstTotal: 1_228_338n,
      sgstTotal: 1_228_338n,
      igstTotal: 0n,
      itemsTotal: 13_965_988n,
      grandTotal: 14_065_988n,
    });
  });

  it("charges IGST across states", () => {
    const lines = purchaseOrderLines(inputs, materials, "inter_state");
    expect(lines[1]).toMatchObject({ cgst: 0n, sgst: 0n, igst: 1_378_676n });
    expect(
      purchaseOrderTotals(lines, {
        additionalCharges: 0n,
        deductionAmount: 0n,
      }).igstTotal,
    ).toBe(2_456_676n);
  });

  it("refuses bad lines with the line's index", () => {
    expect(
      code(() =>
        purchaseOrderLines(
          [
            inputs[0] ?? inputs[1]!,
            {
              materialId: STEEL.id,
              quantity: "1",
              unitRate: 100n,
              discount: { type: "amount", paise: 200n },
            },
          ],
          materials,
          "intra_state",
        ),
      ),
    ).toBe("DISCOUNT_TOO_LARGE");
    expect(
      code(() =>
        purchaseOrderLines(
          [
            {
              materialId: STEEL.id,
              quantity: "1",
              unitRate: 100n,
              gstRate: "101",
            },
          ],
          materials,
          "intra_state",
        ),
      ),
    ).toBe("GST_RATE_INVALID");
    expect(code(() => hsnCode("12345", 0))).toBe("HSN_INVALID");
    expect(hsnCode("72141090", 0)).toBe("72141090");
    expect(code(() => purchaseOrderLines([], materials, "intra_state"))).toBe(
      "ITEMS_REQUIRED",
    );
  });
});

describe("place and type of supply", () => {
  it("reads the delivery state when overridden, else the location's", () => {
    expect(
      placeOfSupply({
        deliveryAddressDiffers: true,
        deliveryStateCode: "29",
        locationStateCode: "33",
      }),
    ).toBe("29");
    expect(
      placeOfSupply({
        deliveryAddressDiffers: false,
        deliveryStateCode: null,
        locationStateCode: "33",
      }),
    ).toBe("33");
    expect(
      supplyTypeFor({
        requested: null,
        supplierStateCode: "33",
        placeOfSupplyStateCode: "29",
      }),
    ).toBe("inter_state");
    expect(
      supplyTypeFor({
        requested: "intra_state",
        supplierStateCode: "33",
        placeOfSupplyStateCode: "29",
      }),
    ).toBe("intra_state");
    expect(
      supplyTypeFor({
        requested: null,
        supplierStateCode: null,
        placeOfSupplyStateCode: "29",
      }),
    ).toBe("intra_state");
  });

  it("needs a delivery address when it differs", () => {
    expect(code(() => deliveryAddress({ differs: true, address: " " }))).toBe(
      "DELIVERY_ADDRESS_REQUIRED",
    );
    expect(
      deliveryAddress({ differs: false, address: "ignored", stateCode: "29" }),
    ).toEqual({
      deliveryAddressDiffers: false,
      deliveryAddress: null,
      deliveryStateCode: null,
    });
  });

  it("takes Indian mobiles for the points of contact", () => {
    expect(
      pointOfContact({ name: " Murugan ", mobile: "77081 65767" }, "sitePoc"),
    ).toEqual({ name: "Murugan", mobile: "+917708165767" });
    expect(
      code(() => pointOfContact({ mobile: "+14155550123" }, "supplierPoc")),
    ).toBe("MOBILE_INVALID");
  });
});

describe("purchase order states", () => {
  const state = (
    patch: Partial<PurchaseOrderState> = {},
  ): PurchaseOrderState => ({
    approvalStatus: "pending",
    orderedAt: null,
    closedAt: null,
    receiptStatus: "not_received",
    ...patch,
  });
  const by = { userId: "u1", at: new Date() };

  it("sends an edited approved PO back to pending, refuses ordered ones", () => {
    expect(
      editedApproval(state({ approvalStatus: "approved" }), null).status,
    ).toBe("pending");
    expect(
      editedApproval(state({ approvalStatus: "rejected" }), by).status,
    ).toBe("approved");
    expect(
      code(() =>
        editedApproval(
          state({ approvalStatus: "approved", orderedAt: new Date() }),
          null,
        ),
      ),
    ).toBe("PURCHASE_ORDER_NOT_EDITABLE");
  });

  it("marks ordered only when approved, closes only when ordered", () => {
    expect(code(() => assertCanMarkPurchaseOrderOrdered(state()))).toBe(
      "PURCHASE_ORDER_NOT_ORDERABLE",
    );
    expect(() => {
      assertCanMarkPurchaseOrderOrdered(state({ approvalStatus: "approved" }));
    }).not.toThrow();
    expect(
      code(() => closeReason(state({ approvalStatus: "approved" }), "x")),
    ).toBe("PURCHASE_ORDER_NOT_CLOSABLE");
    const ordered = state({
      approvalStatus: "approved",
      orderedAt: new Date(),
    });
    expect(closeReason(ordered, " short supply ")).toBe("short supply");
    expect(code(() => closeReason(ordered, ""))).toBe("CLOSE_REASON_REQUIRED");
    expect(
      code(() => closeReason({ ...ordered, receiptStatus: "received" }, "x")),
    ).toBe("PURCHASE_ORDER_NOT_CLOSABLE");
    expect(code(() => assertPurchaseOrderDeletable(1))).toBe(
      "PURCHASE_ORDER_HAS_RECEIPTS",
    );
  });
});

describe("amount in words", () => {
  it("uses lakh and crore", () => {
    expect(rupeesInWords(1_234_567_850n)).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only",
    );
    expect(rupeesInWords(10_000n)).toBe("Rupees One Hundred Only");
    expect(rupeesInWords(0n)).toBe("Rupees Zero Only");
    expect(rupeesInWords(1_000_000_000_000n)).toBe(
      "Rupees One Thousand Crore Only",
    );
  });
});
