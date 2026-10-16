import { conflict, type DomainError } from "./domain-error";

/** Days between asking to delete a Company and its purge (ADR CM-0021 §10). */
export const COMPANY_DELETION_COOLING_OFF_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a deletion asked for at `requestedAt` falls due. */
export function companyDeletionDueAt(requestedAt: Date): Date {
  return new Date(
    requestedAt.getTime() + COMPANY_DELETION_COOLING_OFF_DAYS * DAY_MS,
  );
}

/** "15 Nov 2026", as the banner and the refusal say it. */
export function formatDeletionDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * The refusal of a write while the Company waits to be deleted (CM-907):
 * it is read-only for everyone until the Owner cancels.
 */
export function companyDeletionScheduled(scheduledFor: Date): DomainError {
  return conflict(
    "COMPANY_DELETION_SCHEDULED",
    `This Company will be deleted on ${formatDeletionDate(scheduledFor)}, so it is read-only. The Owner can cancel the deletion.`,
    { scheduledFor: scheduledFor.toISOString() },
  );
}
