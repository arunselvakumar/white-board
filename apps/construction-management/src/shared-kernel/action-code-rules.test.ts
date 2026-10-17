import { describe, expect, it } from "vitest";

import {
  ACTION_CODE_MAX_ATTEMPTS,
  assertCanResend,
  assertTryable,
  codeMatches,
  hashActionCode,
  isActionCodePurpose,
  maskDestination,
  newActionCode,
  type ActionCodeRecord,
} from "./action-code-rules";
import type { DomainError } from "./domain-error";

const NOW = new Date("2026-10-16T10:00:00Z");
const SECRET = "unit-test-secret";

function record(overrides: Partial<ActionCodeRecord> = {}): ActionCodeRecord {
  const base = {
    id: "0199c3a0-0000-7000-8000-000000000001",
    userId: "user-1",
    workspaceId: null,
    sessionId: null,
    purpose: "delete_account" as const,
    attempts: 0,
    expiresAt: new Date(NOW.getTime() + 600_000),
    consumedAt: null,
    createdAt: NOW,
  };
  return {
    ...base,
    codeHash: hashActionCode(SECRET, { ...base, code: "042917" }),
    ...overrides,
  };
}

function refusal(run: () => void): DomainError {
  try {
    run();
  } catch (error) {
    return error as DomainError;
  }
  throw new Error("Expected a refusal.");
}

describe("action code rules", () => {
  it("makes six-digit codes, leading zeros kept", () => {
    for (let index = 0; index < 50; index += 1)
      expect(newActionCode()).toMatch(/^\d{6}$/);
  });

  it("hashes per row, user and purpose", () => {
    const input = {
      id: "a",
      userId: "u",
      purpose: "delete_company" as const,
      code: "123456",
    };
    const hash = hashActionCode(SECRET, input);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("123456");
    expect(hashActionCode(SECRET, { ...input, id: "b" })).not.toBe(hash);
    expect(
      hashActionCode(SECRET, { ...input, purpose: "transfer_ownership" }),
    ).not.toBe(hash);
    expect(hashActionCode("other", input)).not.toBe(hash);
  });

  it("matches the right code only, and the test code when set", () => {
    const stored = record();
    expect(codeMatches(SECRET, stored, "042917", null)).toBe(true);
    expect(codeMatches(SECRET, stored, " 042917 ", null)).toBe(true);
    expect(codeMatches(SECRET, stored, "042918", null)).toBe(false);
    expect(codeMatches(SECRET, stored, "42917", null)).toBe(false);
    expect(codeMatches(SECRET, stored, "246810", null)).toBe(false);
    expect(codeMatches(SECRET, stored, "246810", "246810")).toBe(true);
  });

  it("allows one code a minute", () => {
    expect(() => {
      assertCanResend(null, NOW);
    }).not.toThrow();
    const soon = refusal(() => {
      assertCanResend({ createdAt: new Date(NOW.getTime() - 20_000) }, NOW);
    });
    expect(soon).toMatchObject({
      code: "ACTION_CODE_TOO_SOON",
      kind: "too_many",
      details: { retryAfterSeconds: 40 },
    });
    expect(() => {
      assertCanResend({ createdAt: new Date(NOW.getTime() - 60_000) }, NOW);
    }).not.toThrow();
  });

  it("refuses missing, used, expired and locked codes", () => {
    expect(
      refusal(() => {
        assertTryable(null, NOW);
      }).code,
    ).toBe("ACTION_CODE_NOT_FOUND");
    expect(
      refusal(() => {
        assertTryable(record({ consumedAt: NOW }), NOW);
      }).code,
    ).toBe("ACTION_CODE_NOT_FOUND");
    expect(
      refusal(() => {
        assertTryable(record({ expiresAt: NOW }), NOW);
      }).code,
    ).toBe("ACTION_CODE_EXPIRED");
    expect(
      refusal(() => {
        assertTryable(record({ attempts: ACTION_CODE_MAX_ATTEMPTS }), NOW);
      }),
    ).toMatchObject({ code: "ACTION_CODE_LOCKED", kind: "too_many" });
    expect(() => {
      assertTryable(record({ attempts: ACTION_CODE_MAX_ATTEMPTS - 1 }), NOW);
    }).not.toThrow();
  });

  it("knows its purposes and masks where a code went", () => {
    expect(isActionCodePurpose("reveal_identifiers")).toBe(true);
    expect(isActionCodePurpose("everything")).toBe(false);
    expect(maskDestination("email", "asha@anugraha.in")).toBe(
      "a•••@anugraha.in",
    );
    expect(maskDestination("sms", "+917708165767")).toBe("•••••5767");
  });
});
