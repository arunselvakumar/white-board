import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  clientDetails,
  clientInUse,
  isValidPinCode,
  isValidTan,
  type ClientInput,
} from "./client";

function errorOf(run: () => unknown): { code: string; details: unknown } {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("Expected a DomainError");
}

const client = (input: Partial<ClientInput>) =>
  clientDetails({ name: "Sri Balaji Developers", ...input });

describe("Client (ADR CM-0023 §2)", () => {
  it("tidies every field and takes the state from the GSTIN", () => {
    expect(
      clientDetails({
        name: "  Sri  Balaji   Developers ",
        contactPerson: " Ravi ",
        mobile: "77081 65767",
        email: "Accounts@Balaji.IN",
        address: " 12, Anna Salai\nChennai ",
        pinCode: "600 002",
        gstin: "33aapfa0939f1zm",
        pan: "aapfa0939f",
        tan: "chea12345b",
      }),
    ).toEqual({
      name: "Sri Balaji Developers",
      contactPerson: "Ravi",
      mobile: "+917708165767",
      email: "accounts@balaji.in",
      address: "12, Anna Salai\nChennai",
      pinCode: "600002",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      tan: "CHEA12345B",
      stateCode: "33",
    });
  });

  it("keeps a picked state when there is no GSTIN", () => {
    expect(client({ stateCode: "29" }).stateCode).toBe("29");
    expect(client({ stateCode: "" }).stateCode).toBeNull();
  });

  it("names the field of each refusal", () => {
    for (const [input, code, field] of [
      [{ name: " " }, "CLIENT_NAME_REQUIRED", "name"],
      [{ name: "x".repeat(121) }, "CLIENT_NAME_TOO_LONG", "name"],
      [{ mobile: "123" }, "MOBILE_INVALID", "mobile"],
      [{ email: "not-an-email" }, "EMAIL_INVALID", "email"],
      [{ pinCode: "06000" }, "PIN_CODE_INVALID", "pinCode"],
      [{ pinCode: "060002" }, "PIN_CODE_INVALID", "pinCode"],
      [{ gstin: "33AAPFA0939F1ZW" }, "GSTIN_INVALID", "gstin"],
      [{ pan: "ABC" }, "PAN_INVALID", "pan"],
      [
        { gstin: "33AAPFA0939F1ZM", pan: "AAACB1234C" },
        "GSTIN_PAN_MISMATCH",
        "gstin",
      ],
      [{ tan: "CHE12345B" }, "TAN_INVALID", "tan"],
      [{ stateCode: "99" }, "GST_STATE_INVALID", "stateCode"],
      [
        { gstin: "33AAPFA0939F1ZM", stateCode: "29" },
        "GSTIN_STATE_MISMATCH",
        "stateCode",
      ],
    ] as const)
      expect(
        errorOf(() => client(input)),
        code,
      ).toEqual({
        code,
        details: { field },
      });
  });

  it("checks TAN and PIN shapes", () => {
    expect(isValidTan("CHEA12345B")).toBe(true);
    expect(isValidTan("chea12345b")).toBe(true);
    expect(isValidTan("CHEA1234BB")).toBe(false);
    expect(isValidPinCode("600002")).toBe(true);
    expect(isValidPinCode("60002")).toBe(false);
  });

  it("says how many Projects hold a Client in use", () => {
    expect(clientInUse(1)).toMatchObject({
      code: "CLIENT_IN_USE",
      kind: "conflict",
      details: { projectCount: 1 },
    });
    expect(clientInUse(3).message).toMatch(/^3 Projects are linked/);
  });
});
