import type { MasterListParams } from "../application/material-ports";

type CursorFilter = {
  OR: (
    | { createdAt: { lt: Date } | { gt: Date } }
    | { createdAt: Date; id: { lt: string } | { gt: string } }
  )[];
};

/**
 * Newest first by `createdAt`, then `id` (root ADR-0020): `after` pages
 * forward (older rows), `before` pages back. Returns the extra filter, the
 * order and how many rows to fetch (one more than the page, to know
 * whether more follow).
 */
export function pageQuery(
  params: Pick<MasterListParams, "after" | "before" | "limit">,
) {
  const backwards = params.before != null;
  const cursor = params.after ?? params.before;
  const filter: CursorFilter | null =
    cursor == null
      ? null
      : {
          OR: backwards
            ? [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ]
            : [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
        };
  const direction = backwards ? ("asc" as const) : ("desc" as const);
  return {
    filter,
    orderBy: [{ createdAt: direction }, { id: direction }],
    take: params.limit + 1,
    backwards,
  };
}

/** Trims the extra row and restores newest-first order. */
export function pageOf<T>(
  rows: T[],
  params: Pick<MasterListParams, "before" | "limit">,
): { items: T[]; hasMore: boolean } {
  const hasMore = rows.length > params.limit;
  const items = rows.slice(0, params.limit);
  if (params.before != null) items.reverse();
  return { items, hasMore };
}

/** `status=` as a `disabledAt` filter. */
export function statusFilter(
  status: MasterListParams["status"],
): { disabledAt: null } | { disabledAt: { not: null } } | null {
  if (status === "enabled") return { disabledAt: null };
  if (status === "disabled") return { disabledAt: { not: null } };
  return null;
}
