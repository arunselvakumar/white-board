/**
 * Soft delete is an invisible tombstone (root ADR-0019): rows keep
 * `deleted_at`/`deleted_by`, and every read filters them out.
 */
export function withTombstone<Where extends object>(
  where: Where,
): Where & { deletedAt: null } {
  return { ...where, deletedAt: null };
}

/** The columns a soft delete writes. */
export function tombstone(
  deletedBy: string,
  now: Date = new Date(),
): { deletedAt: Date; deletedBy: string; updatedAt: Date; updatedBy: string } {
  return { deletedAt: now, deletedBy, updatedAt: now, updatedBy: deletedBy };
}
