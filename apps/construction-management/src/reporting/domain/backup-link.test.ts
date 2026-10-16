import { describe, expect, it } from "vitest";

import {
  backupSignatureMatches,
  checkBackupLink,
  signBackupLink,
  signedBackupPath,
} from "./backup-link";

const SECRET = "unit-test-secret";
const NOW = new Date("2026-10-16T10:00:00.000Z");
const EXPIRES = Math.floor(NOW.getTime() / 1000) + 7 * 86_400;
const CLAIMS = {
  backupId: "backup-1",
  requestedBy: "user-1",
  expires: EXPIRES,
};

function check(overrides: Partial<Parameters<typeof checkBackupLink>[0]> = {}) {
  return checkBackupLink({
    secret: SECRET,
    backupId: "backup-1",
    requestedBy: "user-1",
    viewerUserId: "user-1",
    expires: EXPIRES,
    signature: signBackupLink(SECRET, CLAIMS),
    now: NOW,
    ...overrides,
  });
}

describe("backup link signatures (CM-906)", () => {
  it("is stable for the same claims and changes with any of them or the key", () => {
    const signature = signBackupLink(SECRET, CLAIMS);
    expect(signBackupLink(SECRET, CLAIMS)).toBe(signature);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const changed of [
      { ...CLAIMS, backupId: "backup-2" },
      { ...CLAIMS, requestedBy: "user-2" },
      { ...CLAIMS, expires: EXPIRES + 1 },
    ])
      expect(signBackupLink(SECRET, changed)).not.toBe(signature);
    expect(signBackupLink("another-secret", CLAIMS)).not.toBe(signature);
    expect(backupSignatureMatches(SECRET, CLAIMS, signature)).toBe(true);
    expect(backupSignatureMatches(SECRET, CLAIMS, `${signature}x`)).toBe(false);
  });

  it("accepts the requester's own unexpired link", () => {
    expect(check()).toEqual({ ok: true });
  });

  it("refuses a tampered link, a passed expiry and another User", () => {
    expect(check({ signature: "tampered" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(check({ expires: EXPIRES + 60 })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(check({ backupId: "backup-2" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(check({ expires: Number.NaN })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(check({ now: new Date(EXPIRES * 1000) })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(check({ viewerUserId: "user-2" })).toEqual({
      ok: false,
      reason: "not_yours",
    });
  });

  it("builds the download path with expires and sig", () => {
    const path = signedBackupPath(
      SECRET,
      "/api/construction/reporting/backups",
      CLAIMS,
    );
    const url = new URL(`http://localhost${path}`);
    expect(url.pathname).toBe(
      "/api/construction/reporting/backups/backup-1/download",
    );
    expect(url.searchParams.get("expires")).toBe(String(EXPIRES));
    expect(url.searchParams.get("sig")).toBe(signBackupLink(SECRET, CLAIMS));
  });
});
