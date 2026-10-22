import { Prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { isPrismaError, isUniqueViolation } from "./prisma-errors";

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("Request failed.", {
    code,
    clientVersion: Prisma.prismaVersion.client,
  });
}

/**
 * The same error built by another copy of the generated client, as under
 * `next dev --webpack` (#98): same name and code, another class.
 */
function errorFromAnotherClientCopy(code: string) {
  class PrismaClientKnownRequestError extends Error {
    override name = "PrismaClientKnownRequestError";
    constructor(readonly code: string) {
      super("Unique constraint failed on the fields: (`workspace_id`)");
    }
  }
  return new PrismaClientKnownRequestError(code);
}

describe("isUniqueViolation", () => {
  it("is true for P2002, from this client or another copy of it", () => {
    expect(isUniqueViolation(knownError("P2002"))).toBe(true);
    const foreign = errorFromAnotherClientCopy("P2002");
    // The check the stores used to make, which missed it.
    // eslint-disable-next-line no-restricted-syntax
    expect(foreign instanceof Prisma.PrismaClientKnownRequestError).toBe(false);
    expect(isUniqueViolation(foreign)).toBe(true);
  });

  it("is false for other codes and other errors", () => {
    expect(isUniqueViolation(knownError("P2025"))).toBe(false);
    expect(isUniqueViolation(errorFromAnotherClientCopy("P2025"))).toBe(false);
    expect(
      isUniqueViolation(Object.assign(new Error(), { code: "P2002" })),
    ).toBe(false);
    expect(
      isUniqueViolation({
        name: "PrismaClientKnownRequestError",
        code: "P2002",
      }),
    ).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("isPrismaError", () => {
  it("matches the code it is asked for", () => {
    expect(isPrismaError(knownError("P2010"), "P2010")).toBe(true);
    expect(isPrismaError(knownError("P2010"), "P2002")).toBe(false);
  });
});
