import { prisma } from "@repo/construction-db";

import { companyDeletionScheduled } from "@/src/shared-kernel/company-deletion";

import { mapError } from "./map-error";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Writes that stay open while a Company waits to be deleted (CM-907, ADR
 * CM-0021 §10): the Owner's Cancel, codes, the User's own account and
 * devices, reports, backups and exports (CM-118 keeps export open), the
 * member's own notifications, and reveals (a read sent as POST). Every
 * other POST, PUT, PATCH or DELETE under `/api/construction` answers 409
 * `COMPANY_DELETION_SCHEDULED`. Append a path here when a new write must
 * stay open.
 */
export const WRITES_OPEN_DURING_COMPANY_DELETION: readonly RegExp[] = [
  /^\/api\/construction\/organization\/company-deletion(\/|$)/,
  /^\/api\/construction\/organization\/action-codes(\/|$)/,
  /^\/api\/construction\/organization\/companies(\/|$)/,
  /^\/api\/construction\/organization\/me\/devices(\/|$)/,
  /^\/api\/construction\/organization\/me\/account(\/|$)/,
  /^\/api\/construction\/organization\/me\/profile\/reveal-identifiers$/,
  /^\/api\/construction\/organization\/team-members\/[^/]+\/reveal$/,
  /^\/api\/construction\/reporting\//,
  /^\/api\/construction\/messaging\//,
  /^\/api\/construction\/queue\//,
];

/** Whether a request writes, and is not one of the writes left open. */
export function isGuardedWrite(request: Request): boolean {
  if (READ_METHODS.has(request.method.toUpperCase())) return false;
  const path = new URL(request.url, "http://localhost").pathname;
  return !WRITES_OPEN_DURING_COMPANY_DELETION.some((open) => open.test(path));
}

/** When a Company's pending deletion falls due, or null when none is pending. */
export async function pendingCompanyDeletion(
  workspaceId: string,
): Promise<Date | null> {
  const row = await prisma.constructionOrganizationCompanyDeletion.findFirst({
    where: {
      deletedWorkspaceId: workspaceId,
      cancelledAt: null,
      completedAt: null,
    },
    select: { scheduledFor: true },
    orderBy: { requestedAt: "desc" },
  });
  return row?.scheduledFor ?? null;
}

// One lookup per request, however many guards ask.
const checked = new WeakMap<Request, Promise<Date | null>>();

/**
 * 409 `COMPANY_DELETION_SCHEDULED` for a guarded write to a Company in
 * its 30-day cooling-off, or null. `requireCompanySession` calls it for
 * every request, so every write route is covered.
 */
export async function requireCompanyNotBeingDeleted(
  request: Request,
  workspaceId: string,
): Promise<Response | null> {
  if (!isGuardedWrite(request)) return null;
  let pending = checked.get(request);
  if (pending == null) {
    pending = pendingCompanyDeletion(workspaceId);
    checked.set(request, pending);
  }
  const scheduledFor = await pending;
  return scheduledFor == null
    ? null
    : mapError(companyDeletionScheduled(scheduledFor));
}
