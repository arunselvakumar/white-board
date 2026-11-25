import { describe, expect, it } from "vitest";

import {
  assertCanClose,
  assertCanReopen,
  centreDetails,
  franchiseTerms,
  royaltyBpsToPercent,
  royaltyPercentToBps,
} from "./centre";
import { PreschoolError } from "./errors";

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof PreschoolError) return error.code;
    throw error;
  }
  return undefined;
}

describe("centreDetails", () => {
  it("trims, upper-cases the code and turns blanks into null", () => {
    expect(
      centreDetails({
        name: "  Little Steps Anna Nagar ",
        code: " lsan ",
        phone: " ",
        email: " Office@LittleSteps.in ",
        pincode: "600040",
      }),
    ).toEqual({
      name: "Little Steps Anna Nagar",
      code: "LSAN",
      phone: null,
      email: "office@littlesteps.in",
      addressLine: null,
      city: null,
      state: null,
      pincode: "600040",
    });
  });

  it("needs a name and a 2–6 character code of letters and digits", () => {
    expect(codeOf(() => centreDetails({ name: " ", code: "LS" }))).toBe(
      "CENTRE_NAME_REQUIRED",
    );
    for (const code of ["L", "LSANNAG", "LS-1", "ಎಲ್"])
      expect(codeOf(() => centreDetails({ name: "A", code }))).toBe(
        "CENTRE_CODE_INVALID",
      );
    for (const code of ["LS", "B2", "LSAN01"])
      expect(codeOf(() => centreDetails({ name: "A", code }))).toBeUndefined();
  });

  it("checks a PIN code has six digits", () => {
    expect(
      codeOf(() => centreDetails({ name: "A", code: "AB", pincode: "60004" })),
    ).toBe("PINCODE_INVALID");
  });
});

describe("royalty", () => {
  it("converts percentages with up to two decimals to basis points", () => {
    expect(royaltyPercentToBps(0)).toBe(0);
    expect(royaltyPercentToBps(10)).toBe(1000);
    expect(royaltyPercentToBps(12.5)).toBe(1250);
    expect(royaltyPercentToBps(7.35)).toBe(735);
    expect(royaltyPercentToBps(100)).toBe(10_000);
    expect(royaltyBpsToPercent(735)).toBe(7.35);
  });

  it("refuses more than two decimals and anything outside 0–100", () => {
    for (const percent of [-1, 100.01, 12.345, Number.NaN])
      expect(codeOf(() => royaltyPercentToBps(percent))).toBe(
        "ROYALTY_INVALID",
      );
  });
});

describe("franchiseTerms", () => {
  it("clears the franchisee and royalty of a Company-owned Centre", () => {
    expect(
      franchiseTerms({
        ownership: "company_owned",
        franchiseeName: "Priya",
        royaltyPercent: 10,
        mayOverrideFees: false,
      }),
    ).toEqual({
      ownership: "company_owned",
      franchiseeName: null,
      franchiseePhone: null,
      franchiseeEmail: null,
      agreementStartOn: null,
      agreementEndOn: null,
      royaltyBps: 0,
      mayOverrideFees: false,
    });
  });

  it("keeps a Franchised Centre's franchisee and royalty", () => {
    expect(
      franchiseTerms({
        ownership: "franchised",
        franchiseeName: " Priya Raman ",
        franchiseeEmail: "Priya@Example.in",
        agreementStartOn: "2026-04-01",
        agreementEndOn: "2031-03-31",
        royaltyPercent: 8.5,
        mayOverrideFees: true,
      }),
    ).toMatchObject({
      ownership: "franchised",
      franchiseeName: "Priya Raman",
      franchiseeEmail: "priya@example.in",
      royaltyBps: 850,
    });
  });

  it("needs the franchisee's name and agreement dates in order", () => {
    expect(
      codeOf(() =>
        franchiseTerms({ ownership: "franchised", mayOverrideFees: true }),
      ),
    ).toBe("FRANCHISEE_NAME_REQUIRED");
    expect(
      codeOf(() =>
        franchiseTerms({
          ownership: "franchised",
          franchiseeName: "Priya",
          agreementStartOn: "2026-04-01",
          agreementEndOn: "2026-03-31",
          mayOverrideFees: true,
        }),
      ),
    ).toBe("AGREEMENT_DATES_INVALID");
    expect(
      codeOf(() =>
        franchiseTerms({
          ownership: "franchised",
          franchiseeName: "Priya",
          agreementStartOn: "2026-02-30",
          mayOverrideFees: true,
        }),
      ),
    ).toBe("AGREEMENT_DATE_INVALID");
  });
});

describe("closing and reopening", () => {
  it("closes an open Centre with no active Children", () => {
    expect(
      codeOf(() => {
        assertCanClose({ status: "active" }, 0);
      }),
    ).toBe(undefined);
  });

  it("refuses to close a Centre with active Children, or a closed one", () => {
    expect(
      codeOf(() => {
        assertCanClose({ status: "active" }, 3);
      }),
    ).toBe("CENTRE_HAS_ACTIVE_CHILDREN");
    expect(
      codeOf(() => {
        assertCanClose({ status: "closed" }, 0);
      }),
    ).toBe("CENTRE_ALREADY_CLOSED");
  });

  it("reopens only a closed Centre", () => {
    expect(
      codeOf(() => {
        assertCanReopen({ status: "closed" });
      }),
    ).toBe(undefined);
    expect(
      codeOf(() => {
        assertCanReopen({ status: "active" });
      }),
    ).toBe("CENTRE_NOT_CLOSED");
  });
});
