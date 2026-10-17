import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { SALES_LIMITS } from "./sales-terms";

/**
 * A Project's sales lists (CM-1002, ADR CM-0022 §2): Funnel Stages (in
 * funnel order), Lead Sources and Lost Reasons. Names are unique among a
 * Project's live rows, ignoring case. Lead Sources and Lost Reasons can be
 * disabled (they leave the pickers; old inquiries keep them); a stage
 * cannot, it is moved or deleted instead.
 */

export const SALES_LIST_KINDS = [
  "funnel_stage",
  "lead_source",
  "lost_reason",
] as const;
export type SalesListKind = (typeof SALES_LIST_KINDS)[number];

/** The lists that can be disabled. */
export type SalesPickList = Exclude<SalesListKind, "funnel_stage">;

export const SALES_LIST_WORDS: Record<
  SalesListKind,
  { code: string; label: string; article: "A" | "An" }
> = {
  funnel_stage: { code: "FUNNEL_STAGE", label: "Funnel Stage", article: "A" },
  lead_source: { code: "LEAD_SOURCE", label: "Lead Source", article: "A" },
  lost_reason: { code: "LOST_REASON", label: "Lost Reason", article: "A" },
};

function refused(code: string, message: string): DomainError {
  return new DomainError(code, message, { details: { field: "name" } });
}

/**
 * A list row's name, trimmed: 400 `<KIND>_NAME_REQUIRED` when empty,
 * `<KIND>_NAME_TOO_LONG` above 60 characters.
 */
export function salesListName(kind: SalesListKind, raw: string): string {
  const { code, label } = SALES_LIST_WORDS[kind];
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "")
    throw refused(`${code}_NAME_REQUIRED`, `Enter the ${label}'s name.`);
  if (name.length > SALES_LIMITS.listName)
    throw refused(
      `${code}_NAME_TOO_LONG`,
      `Use at most ${String(SALES_LIMITS.listName)} characters.`,
    );
  return name;
}

/** 409 `<KIND>_NAME_IN_USE`: another live row of the Project has it (any case). */
export function salesListNameInUse(kind: SalesListKind): DomainError {
  const { code, label, article } = SALES_LIST_WORDS[kind];
  return new DomainError(
    `${code}_NAME_IN_USE`,
    `${article} ${label} with this name already exists in this Project.`,
    { kind: "conflict", details: { field: "name" } },
  );
}

export function salesListNotFound(kind: SalesListKind): DomainError {
  const { code, label } = SALES_LIST_WORDS[kind];
  return notFound(`${code}_NOT_FOUND`, `This ${label} was not found.`);
}

/** 409 `<KIND>_CHANGED` when a rename sends a stale `updatedAt`. */
export function salesListChanged(
  kind: SalesListKind,
  updatedAt: Date,
): DomainError {
  const { code, label } = SALES_LIST_WORDS[kind];
  return conflict(
    `${code}_CHANGED`,
    `Someone changed this ${label}. Reload and try again.`,
    { updatedAt: updatedAt.toISOString() },
  );
}

/** 409 `FUNNEL_STAGE_IN_USE`: Open inquiries sit in the stage (CM-0022 §2). */
export function funnelStageInUse(openCount: number): DomainError {
  return conflict(
    "FUNNEL_STAGE_IN_USE",
    `${String(openCount)} open ${openCount === 1 ? "inquiry is" : "inquiries are"} in this stage. Move them to another stage first.`,
    { openCount },
  );
}

/** 409 `FUNNEL_STAGE_LAST`: a Project keeps at least one stage. */
export function funnelStageLast(): DomainError {
  return conflict(
    "FUNNEL_STAGE_LAST",
    "This is the Project's only Funnel Stage. Add another before deleting it.",
  );
}

/** 409 `LEAD_SOURCE_IN_USE` / `LOST_REASON_IN_USE` with `details.count`. */
export function salesPickInUse(
  kind: SalesPickList,
  count: number,
): DomainError {
  const { code, label } = SALES_LIST_WORDS[kind];
  const used = `${String(count)} ${count === 1 ? "inquiry uses" : "inquiries use"} this ${label}`;
  return conflict(
    `${code}_IN_USE`,
    `${used}, so it cannot be deleted. Disable it instead.`,
    { count },
  );
}

export type StageMove = "up" | "down";

/**
 * The stage order after moving `id` one place (CM-1002): the ids in their
 * new order, or null when it is already first (up) or last (down) — a move
 * that changes nothing.
 */
export function movedStageOrder(
  order: readonly string[],
  id: string,
  direction: StageMove,
): string[] | null {
  const at = order.indexOf(id);
  if (at === -1) return null;
  const to = direction === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= order.length) return null;
  const next = [...order];
  const other = next[to];
  if (other == null) return null;
  next[to] = id;
  next[at] = other;
  return next;
}

/** Whether two names collide in a Project (case and spacing ignored). */
export function sameSalesListName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
