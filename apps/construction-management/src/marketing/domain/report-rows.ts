import type { OwnScope } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { isFollowUpVisible } from "./follow-up";
import type {
  FollowUpStatus,
  Stage,
  VisitShownStatus,
  VisitStatus,
} from "./marketing-terms";
import { isProspectCompanyVisible } from "./prospect-company";
import { targetFor } from "./team";
import { isVisitVisible, shownStatus } from "./visit";

/**
 * Marketing's rules for its three Reports (ADR CM-0040 §13): which records
 * a requester's scope keeps (§5), Missed (§7), and how the summary and the
 * pipeline are worked out. Pure, so each rule is tested once; the report
 * source reads the rows and the reporting context lays them out.
 */

/** A record scope fixed with a report job: every record, the own ones, or none. */
export type ReportRecordScope = "all" | "none" | OwnScope;

function keeps<T>(
  scope: ReportRecordScope,
  visible: (record: T, own: OwnScope) => boolean,
): (record: T) => boolean {
  if (scope === "none") return () => false;
  if (scope === "all") return () => true;
  return (record) => visible(record, scope);
}

type ScopedVisit = {
  createdBy: string;
  visitorIds: readonly string[];
};

/** The Visits a scope keeps (§5: created by the requester, or one of its visitors). */
export function visitsInScope<T extends ScopedVisit>(
  visits: readonly T[],
  scope: ReportRecordScope,
): T[] {
  return visits.filter(keeps<T>(scope, isVisitVisible));
}

/** The Prospect Companies a scope keeps (§5: created by, or assigned to, the requester). */
export function companiesInScope<
  T extends { createdBy: string; assignedMemberId: string | null },
>(companies: readonly T[], scope: ReportRecordScope): T[] {
  return companies.filter(keeps<T>(scope, isProspectCompanyVisible));
}

/** The Follow-ups a scope keeps (§5: created by, or owned by, the requester). */
export function followUpsInScope<
  T extends { createdBy: string; ownerMemberId: string },
>(followUps: readonly T[], scope: ReportRecordScope): T[] {
  return followUps.filter(keeps<T>(scope, isFollowUpVisible));
}

// ---------------------------------------------------------------------------
// Visit register
// ---------------------------------------------------------------------------

export type RegisterVisit = ScopedVisit & {
  id: string;
  visitAt: Date;
  status: VisitStatus;
  checkedIn: boolean;
};

/**
 * The register's Visits: those the scope keeps, with the status a list
 * shows (Missed as on `now`), narrowed to `status` when one is picked,
 * newest first.
 */
export function visitRegister<T extends RegisterVisit>(
  visits: readonly T[],
  input: {
    scope: ReportRecordScope;
    now: Date;
    status: VisitShownStatus | null;
  },
): (T & { shown: VisitShownStatus })[] {
  return visitsInScope(visits, input.scope)
    .map((visit) => ({ ...visit, shown: shownStatus(visit, input.now) }))
    .filter((visit) => input.status == null || visit.shown === input.status)
    .sort(
      (a, b) =>
        b.visitAt.getTime() - a.visitAt.getTime() || b.id.localeCompare(a.id),
    );
}

/** The earliest due date of the Open ones, or null. */
export function nextOpenDue(
  followUps: readonly { status: FollowUpStatus; dueDate: CalendarDate }[],
): CalendarDate | null {
  let next: CalendarDate | null = null;
  for (const followUp of followUps)
    if (followUp.status === "open" && (next == null || followUp.dueDate < next))
      next = followUp.dueDate;
  return next;
}

// ---------------------------------------------------------------------------
// Marketing Person summary
// ---------------------------------------------------------------------------

/** One person's counts for the month, keyed by Team Member id. */
export type SummaryFigures = {
  completed: ReadonlyMap<string, number>;
  missed: ReadonlyMap<string, number>;
  newCompanies: ReadonlyMap<string, number>;
  followUpsDone: ReadonlyMap<string, number>;
  followUpsOverdue: ReadonlyMap<string, number>;
  won: ReadonlyMap<string, number>;
};

export type SummaryRow = {
  memberId: string;
  name: string;
  active: boolean;
  target: number | null;
  completed: number;
  missed: number;
  newCompanies: number;
  followUpsDone: number;
  followUpsOverdue: number;
  won: number;
};

/**
 * The summary's rows: every active Marketing Person, and anyone else with
 * a figure in the month (an inactive person, or someone who left the
 * Role), active first then by name. `onlyMemberId` gives the requester's
 * own row alone (no Visits View all), even an empty one; null gives none.
 */
export function personSummary(input: {
  month: string;
  people: readonly { id: string; name: string; active: boolean }[];
  /** Names of the others with figures, from the organization. */
  otherNames: ReadonlyMap<string, string>;
  figures: SummaryFigures;
  targets: readonly {
    memberId: string;
    effectiveMonth: string;
    target: number | null;
  }[];
  /** Undefined for everyone; a Team Member id or null for one row or none. */
  onlyMemberId?: string | null;
}): SummaryRow[] {
  const { figures } = input;
  const maps = Object.values(figures);
  const busy = new Set(
    maps.flatMap((map) =>
      [...map.entries()].flatMap(([id, n]) => (n > 0 ? [id] : [])),
    ),
  );
  const known = new Map(input.people.map((person) => [person.id, person]));
  const everyone = [
    ...input.people
      .filter((person) => person.active || busy.has(person.id))
      .map((person) => person.id),
    ...[...busy].filter((id) => !known.has(id)),
  ];
  // The requester's own row shows even with nothing in it.
  const ids =
    input.onlyMemberId === undefined
      ? everyone
      : input.onlyMemberId == null
        ? []
        : [input.onlyMemberId];
  const count = (map: ReadonlyMap<string, number>, id: string) =>
    map.get(id) ?? 0;
  return ids
    .map((id) => {
      const person = known.get(id);
      return {
        memberId: id,
        name: person?.name ?? input.otherNames.get(id) ?? "Removed member",
        active: person?.active ?? false,
        target: targetFor(
          input.targets.filter((row) => row.memberId === id),
          input.month,
        ),
        completed: count(figures.completed, id),
        missed: count(figures.missed, id),
        newCompanies: count(figures.newCompanies, id),
        followUpsDone: count(figures.followUpsDone, id),
        followUpsOverdue: count(figures.followUpsOverdue, id),
        won: count(figures.won, id),
      };
    })
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
}

// ---------------------------------------------------------------------------
// Company pipeline
// ---------------------------------------------------------------------------

/** A Visit of a company in the pipeline, already read through the scope. */
export type PipelineVisit = {
  visitAt: Date;
  status: VisitStatus;
  /** Whole rupees, when the Visit has one. */
  value: number | null;
};

/** The latest Completed Visit up to `until` (exclusive). */
export function lastCompletedVisitAt(
  visits: readonly PipelineVisit[],
  until: Date,
): Date | null {
  let last: Date | null = null;
  for (const visit of visits)
    if (
      visit.status === "completed" &&
      visit.visitAt < until &&
      (last == null || visit.visitAt > last)
    )
      last = visit.visitAt;
  return last;
}

/**
 * The approximate value of the latest Visit up to `until` (exclusive) that
 * has one; a Cancelled Visit's does not count.
 */
export function latestValue(
  visits: readonly PipelineVisit[],
  until: Date,
): number | null {
  let latest: PipelineVisit | null = null;
  for (const visit of visits)
    if (
      visit.value != null &&
      visit.status !== "cancelled" &&
      visit.visitAt < until &&
      (latest == null || visit.visitAt > latest.visitAt)
    )
      latest = visit;
  return latest?.value ?? null;
}

/**
 * A company's Stage up to `until` (exclusive): the last change before it;
 * `current` when none is kept.
 */
export function stageOn(
  changes: readonly { toStage: Stage; changedAt: Date }[],
  until: Date,
  current: Stage,
): Stage {
  let last: { toStage: Stage; changedAt: Date } | null = null;
  for (const change of changes)
    if (
      change.changedAt < until &&
      (last == null || change.changedAt >= last.changedAt)
    )
      last = change;
  return last?.toStage ?? current;
}

/**
 * Whether a Follow-up was Open at `until` (the end of the as-on day): made
 * before it, and not yet Done or Cancelled then.
 */
export function openAt(
  followUp: {
    status: FollowUpStatus;
    createdAt: Date;
    doneAt: Date | null;
    cancelledAt: Date | null;
  },
  until: Date,
): boolean {
  if (followUp.createdAt >= until) return false;
  if (followUp.status === "open") return true;
  const closedAt =
    followUp.status === "done" ? followUp.doneAt : followUp.cancelledAt;
  return closedAt != null && closedAt >= until;
}
