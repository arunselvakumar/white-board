import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A backup's signed link (ADR CM-0021 §8): an HMAC-SHA-256 over the
 * backup's id, its requester and the link's expiry (Unix seconds), keyed
 * with the app's secret. The download route checks the signature, then
 * the expiry, then that the signed-in User is the requester.
 */

export type BackupLinkClaims = {
  backupId: string;
  requestedBy: string;
  /** Unix seconds. */
  expires: number;
};

function payload(claims: BackupLinkClaims): string {
  return `backup-link\n${claims.backupId}\n${claims.requestedBy}\n${String(claims.expires)}`;
}

export function signBackupLink(
  secret: string,
  claims: BackupLinkClaims,
): string {
  return createHmac("sha256", secret)
    .update(payload(claims))
    .digest("base64url");
}

/** Whether `signature` was made for exactly these claims. */
export function backupSignatureMatches(
  secret: string,
  claims: BackupLinkClaims,
  signature: string,
): boolean {
  const expected = Buffer.from(signBackupLink(secret, claims));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type BackupLinkCheck =
  { ok: true } | { ok: false; reason: "invalid" | "expired" | "not_yours" };

/**
 * Checks a link's query against the backup it names: tampered or for
 * another backup → invalid; past its expiry → expired; signed in as
 * someone else → not yours.
 */
export function checkBackupLink(input: {
  secret: string;
  backupId: string;
  requestedBy: string;
  viewerUserId: string;
  expires: number;
  signature: string;
  now: Date;
}): BackupLinkCheck {
  if (
    !Number.isSafeInteger(input.expires) ||
    !backupSignatureMatches(
      input.secret,
      {
        backupId: input.backupId,
        requestedBy: input.requestedBy,
        expires: input.expires,
      },
      input.signature,
    )
  )
    return { ok: false, reason: "invalid" };
  if (input.now.getTime() >= input.expires * 1000)
    return { ok: false, reason: "expired" };
  if (input.viewerUserId !== input.requestedBy)
    return { ok: false, reason: "not_yours" };
  return { ok: true };
}

/** The download path with its signature: `…/backups/<id>/download?expires=&sig=`. */
export function signedBackupPath(
  secret: string,
  basePath: string,
  claims: BackupLinkClaims,
): string {
  const query = new URLSearchParams({
    expires: String(claims.expires),
    sig: signBackupLink(secret, claims),
  });
  return `${basePath}/${claims.backupId}/download?${query.toString()}`;
}
