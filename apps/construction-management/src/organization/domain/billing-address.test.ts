import { describe, expect, it } from "vitest";

import { gstinCheckCharacter } from "@/src/shared-kernel/tax-ids";

import {
  billingAddressDetails,
  compareBillingAddresses,
  type BillingAddressInput,
} from "./billing-address";
import { grnHiddenFields, storedGrnHiddenFields } from "./grn-field-setting";

/** A checksum-valid GSTIN of `state` holding PAN AAPFA0939F. */
function gstinOf(state: string): string {
  const first14 = `${state}AAPFA0939F1Z`;
  return `${first14}${gstinCheckCharacter(first14)}`;
}

const VALID: BillingAddressInput = {
  name: "  Head   office ",
  address: "  12, Anna Salai\nChennai 600002  ",
  stateCode: "33",
  gstin: "33aapfa0939f1zm",
};

function codeOf(input: Partial<BillingAddressInput>): string | undefined {
  try {
    billingAddressDetails({ ...VALID, ...input });
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe("billingAddressDetails (CM-501)", () => {
  it("collapses the name, trims the address and upper-cases the GSTIN", () => {
    expect(billingAddressDetails(VALID)).toEqual({
      name: "Head office",
      address: "12, Anna Salai\nChennai 600002",
      stateCode: "33",
      gstin: "33AAPFA0939F1ZM",
    });
  });

  it("keeps an address without a GSTIN", () => {
    expect(billingAddressDetails({ ...VALID, gstin: "  " }).gstin).toBeNull();
    expect(billingAddressDetails({ ...VALID, gstin: null }).gstin).toBeNull();
    expect(
      billingAddressDetails({ ...VALID, gstin: undefined }).gstin,
    ).toBeNull();
  });

  it("requires a name of at most 120 characters", () => {
    expect(codeOf({ name: "   " })).toBe("BILLING_ADDRESS_NAME_REQUIRED");
    expect(codeOf({ name: "a".repeat(121) })).toBe(
      "BILLING_ADDRESS_NAME_TOO_LONG",
    );
    expect(codeOf({ name: "a".repeat(120) })).toBeUndefined();
  });

  it("requires an address of at most 500 characters", () => {
    expect(codeOf({ address: " \n " })).toBe("ADDRESS_REQUIRED");
    expect(codeOf({ address: "a".repeat(501) })).toBe("ADDRESS_TOO_LONG");
  });

  it("requires a current GST state", () => {
    expect(codeOf({ stateCode: "" })).toBe("GST_STATE_INVALID");
    // 25 (Daman and Diu) and 28 (old Andhra Pradesh) are retired.
    expect(codeOf({ stateCode: "25", gstin: null })).toBe("GST_STATE_INVALID");
    expect(codeOf({ stateCode: "99", gstin: null })).toBe("GST_STATE_INVALID");
    expect(codeOf({ stateCode: "27", gstin: null })).toBeUndefined();
  });

  it("checks the GSTIN and that it belongs to the state", () => {
    expect(codeOf({ gstin: "33AAPFA0939F1ZA" })).toBe("GSTIN_INVALID");
    expect(codeOf({ gstin: "33AAPFA0939F" })).toBe("GSTIN_INVALID");
    expect(codeOf({ stateCode: "27" })).toBe("GSTIN_STATE_MISMATCH");
    expect(
      codeOf({ stateCode: "27", gstin: gstinOf("27").toLowerCase() }),
    ).toBeUndefined();
  });
});

describe("compareBillingAddresses", () => {
  it("puts the default first, then sorts by name ignoring case", () => {
    const sorted = [
      { name: "warehouse", isDefault: false },
      { name: "Branch", isDefault: false },
      { name: "Zonal office", isDefault: true },
    ].sort(compareBillingAddresses);
    expect(sorted.map((item) => item.name)).toEqual([
      "Zonal office",
      "Branch",
      "warehouse",
    ]);
  });
});

describe("grnHiddenFields (CM-501)", () => {
  it("keeps known keys once, in screen order", () => {
    expect(grnHiddenFields(["remark", "invoiceNo", "remark"])).toEqual([
      "invoiceNo",
      "remark",
    ]);
    expect(grnHiddenFields([])).toEqual([]);
  });

  it("refuses unknown keys", () => {
    expect(() => grnHiddenFields(["invoiceNo", "colour"])).toThrow(
      expect.objectContaining({
        code: "GRN_FIELD_UNKNOWN",
        details: { fields: ["colour"] },
      }),
    );
  });

  it("drops stored keys that are no longer optional", () => {
    expect(storedGrnHiddenFields(["vehicleNo", "retired"])).toEqual([
      "vehicleNo",
    ]);
  });
});
