import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PrivateDataCipher } from "./private-data";

describe("PrivateDataCipher", () => {
  const cipher = PrivateDataCipher.fromKey(randomBytes(32).toString("base64"));

  it("round-trips and never stores the plain value", () => {
    const sealed = cipher.encrypt("234123412346");
    expect(sealed).not.toContain("234123412346");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(cipher.decrypt(sealed)).toBe("234123412346");
    expect(cipher.encrypt("234123412346")).not.toBe(sealed);
  });

  it("rejects tampering and the wrong key", () => {
    const sealed = cipher.encrypt("AAPFU0939F");
    const other = PrivateDataCipher.fromKey(randomBytes(32).toString("base64"));
    expect(() => other.decrypt(sealed)).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("XXXXXXXXXX").toString("base64url");
    expect(() => cipher.decrypt(parts.join("."))).toThrow();
  });
});
