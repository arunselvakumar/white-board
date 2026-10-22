import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  clientBillDeductions,
  clientBillGst,
  clientContractTerms,
  GSTIN_NOT_IN_STATE,
  gstinNotInStateMessage,
  lineDeviation,
  supplierForProject,
  type CompanyGstin,
} from "./client-bill";

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "OTHER";
  }
}

const q = (value: number) => BigInt(Math.round(value * 10_000));

const chennai: CompanyGstin = {
  id: "a1",
  name: "Head office",
  address: "Anna Salai, Chennai",
  stateCode: "33",
  gstin: "33AAACV1234F1Z5",
  isDefault: true,
};
const bengaluru: CompanyGstin = {
  id: "a2",
  name: "Bengaluru branch",
  address: "MG Road, Bengaluru",
  stateCode: "29",
  gstin: "29AAACV1234F1Z3",
  isDefault: false,
};

describe("Client Bills: a tax invoice (CM-1107)", () => {
  it("takes the Company GSTIN in the Project's state, with no warning", () => {
    const choice = supplierForProject([chennai, bengaluru], "29");
    expect(choice).toMatchObject({
      gstin: bengaluru.gstin,
      stateCode: "29",
      warning: null,
    });
    const gst = clientBillGst({
      gross: 6_10_559_32n,
      gstRate: 1800n,
      supplierStateCode: choice.stateCode,
      placeOfSupplyStateCode: "29",
    });
    // 18 % of 6,10,559.32 = 1,09,900.6776 → 1,09,900.68; CGST takes the odd paisa.
    expect(gst).toMatchObject({
      supplyType: "intra_state",
      total: 1_09_900_68n,
      cgst: 54_950_34n,
      sgst: 54_950_34n,
      igst: 0n,
      reverseCharge: false,
    });
  });

  it("falls back to the default GSTIN, warns GSTIN_NOT_IN_STATE and charges IGST", () => {
    const choice = supplierForProject([chennai, bengaluru], "32");
    expect(choice).toMatchObject({
      gstin: chennai.gstin,
      stateCode: "33",
      warning: GSTIN_NOT_IN_STATE,
    });
    expect(
      clientBillGst({
        gross: 1_00_000_00n,
        gstRate: 1800n,
        supplierStateCode: choice.stateCode,
        placeOfSupplyStateCode: "32",
      }),
    ).toMatchObject({ supplyType: "inter_state", igst: 18_000_00n, cgst: 0n });
    expect(gstinNotInStateMessage("32")).toContain("Kerala (32)");
    expect(supplierForProject([], "33")).toMatchObject({
      address: null,
      gstin: null,
      warning: GSTIN_NOT_IN_STATE,
    });
  });

  it("marks lines billed past the BOQ quantity as deviations, not errors", () => {
    expect(
      lineDeviation({ cumulativeQuantity: q(130), boqQuantity: q(100) }, 2500n),
    ).toEqual({
      over: true,
      overBy: q(30),
      percentOver: 3000n,
      overLimit: true,
    });
    expect(
      lineDeviation({ cumulativeQuantity: q(110), boqQuantity: q(100) }, 2500n),
    ).toMatchObject({ over: true, overLimit: false, percentOver: 1000n });
    expect(
      lineDeviation({ cumulativeQuantity: q(100), boqQuantity: q(100) }, 2500n),
    ).toMatchObject({ over: false, overBy: null });
  });

  it("takes the four client deductions and checks the terms", () => {
    expect(
      code(() =>
        clientBillDeductions([{ kind: "secured_advance_recovery", amount: 1 }]),
      ),
    ).toBe("BILL_DEDUCTION_KIND_INVALID");
    expect(clientBillDeductions([{ kind: "retention", amount: 100 }])).toEqual([
      { kind: "retention", amount: 100n, description: null, advanceId: null },
    ]);
    expect(
      clientContractTerms({
        retentionPercent: "5",
        retentionCapPercent: 5,
        dlpMonths: 12,
        handoverOn: "2027-03-31",
        sacCode: "9954",
        gstRate: "18",
      }),
    ).toEqual({
      retentionPercent: 500n,
      retentionCapPercent: 500n,
      retentionCompletionPercent: 5000n,
      dlpMonths: 12,
      handoverOn: "2027-03-31",
      sacCode: "9954",
      gstRate: 1800n,
    });
    expect(code(() => clientContractTerms({ gstRate: "40" }))).toBe(
      "GST_RATE_INVALID",
    );
    expect(code(() => clientContractTerms({ handoverOn: "31/03/2027" }))).toBe(
      "HANDOVER_ON_INVALID",
    );
  });
});
