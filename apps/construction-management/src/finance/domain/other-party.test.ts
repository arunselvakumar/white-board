import { describe, expect, it } from "vitest";

import { otherPartyDetails } from "./other-party";

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { code: string }).code;
  }
}

describe("otherPartyDetails", () => {
  it("tidies the fields and takes the GST state from the GSTIN", () => {
    expect(
      otherPartyDetails({
        name: "  Sri   Lakshmi Traders ",
        mobile: "77081 65767",
        email: " Accounts@Lakshmi.IN ",
        gstin: "33aapfa0939f1zm",
        pan: "aapfa0939f",
        address: "  12, Anna Salai\nChennai ",
      }),
    ).toEqual({
      name: "Sri Lakshmi Traders",
      mobile: "+917708165767",
      email: "accounts@lakshmi.in",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      stateCode: "33",
      address: "12, Anna Salai\nChennai",
    });
    expect(otherPartyDetails({ name: "Ravi", stateCode: "29" })).toMatchObject({
      stateCode: "29",
      gstin: null,
      mobile: null,
    });
  });

  it("refuses each bad field with its code", () => {
    expect(codeOf(() => otherPartyDetails({ name: "  " }))).toBe(
      "OTHER_PARTY_NAME_REQUIRED",
    );
    expect(codeOf(() => otherPartyDetails({ name: "x".repeat(121) }))).toBe(
      "OTHER_PARTY_NAME_TOO_LONG",
    );
    expect(codeOf(() => otherPartyDetails({ name: "A", mobile: "12" }))).toBe(
      "MOBILE_INVALID",
    );
    expect(codeOf(() => otherPartyDetails({ name: "A", email: "a@b" }))).toBe(
      "EMAIL_INVALID",
    );
    expect(
      codeOf(() => otherPartyDetails({ name: "A", gstin: "33AAPFA0939F1ZW" })),
    ).toBe("GSTIN_INVALID");
    expect(codeOf(() => otherPartyDetails({ name: "A", pan: "ABC" }))).toBe(
      "PAN_INVALID",
    );
    expect(
      codeOf(() =>
        otherPartyDetails({
          name: "A",
          gstin: "33AAPFA0939F1ZM",
          pan: "AAPPA0939F",
        }),
      ),
    ).toBe("GSTIN_PAN_MISMATCH");
    expect(
      codeOf(() =>
        otherPartyDetails({
          name: "A",
          gstin: "33AAPFA0939F1ZM",
          stateCode: "29",
        }),
      ),
    ).toBe("GSTIN_STATE_MISMATCH");
    expect(
      codeOf(() => otherPartyDetails({ name: "A", stateCode: "99" })),
    ).toBe("GST_STATE_INVALID");
    expect(
      codeOf(() => otherPartyDetails({ name: "A", address: "x".repeat(501) })),
    ).toBe("ADDRESS_TOO_LONG");
  });
});
