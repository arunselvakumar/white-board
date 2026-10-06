import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decryptPrivateBytes,
  encryptPrivateBytes,
} from "./teacher-private-data";

afterEach(() => vi.unstubAllEnvs());

describe("Teacher private data", () => {
  it("encrypts data and restores it with the configured key", () => {
    vi.stubEnv(
      "TEACHER_PRIVATE_DATA_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    const source = Buffer.from("secret bank number");
    const encrypted = encryptPrivateBytes(source);
    expect(Buffer.from(encrypted).includes(source)).toBe(false);
    expect(decryptPrivateBytes(encrypted)).toEqual(source);
  });

  it("refuses to store private data without a valid key", () => {
    vi.stubEnv("TEACHER_PRIVATE_DATA_KEY", "");
    expect(() => encryptPrivateBytes(Buffer.from("sensitive"))).toThrow();
    vi.stubEnv("TEACHER_PRIVATE_DATA_KEY", "short");
    expect(() => encryptPrivateBytes(Buffer.from("sensitive"))).toThrow();
  });
});
