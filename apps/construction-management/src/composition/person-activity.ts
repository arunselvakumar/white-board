import { prisma, type PrismaClient } from "@repo/construction-db";

import {
  LABOUR_ACTIVITY_RANK,
  type CheckInActivityRow,
  type LabourActivitySource,
  type PersonActivityWindow,
} from "@/src/labour/application/labour-activity-ports";
import type { CheckInPersonKind } from "@/src/labour/domain/check-in";
import { PrismaLabourActivity } from "@/src/labour/infrastructure/prisma-labour-activity";
import { masterNotFound } from "@/src/masters/domain/master-kind";
import { siteEngineerSignIn } from "@/src/masters/infrastructure/prisma-site-engineer-sign-ins";
import type { SignInProjectHistory } from "@/src/organization/application/sign-in-project-history";
import { PrismaSignInProjectHistory } from "@/src/organization/infrastructure/prisma-sign-in-project-history";
import { projectNames } from "@/src/projects/infrastructure/prisma-project-names";
import type { MemberAccess } from "@/src/shared-kernel/access";
import {
  ACTIVITY_PAGE_SIZE,
  activityPartId,
  decodeActivityCursor,
  encodeActivityCursor,
  mergeActivity,
  pageAfter,
  type ActivityKey,
} from "@/src/shared-kernel/activity-key";
import { todayIn, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { notFound } from "@/src/shared-kernel/domain-error";

import {
  activityCheckIn,
  checkInProjectIds,
  companyActorNames,
  resolveProjects,
  visibleProjectIds,
  type ActivityPage,
  type ActorNames,
  type LabourActivityEntry,
  type ProjectNames,
} from "./labour-activity";

/** Projects: added to and removed from; check_ins: each Check In and Check Out. */
export const PERSON_ACTIVITY_TYPES = ["all", "projects", "check_ins"] as const;
export type PersonActivityType = (typeof PERSON_ACTIVITY_TYPES)[number];

export type PersonActivityFilter = {
  type: PersonActivityType;
  projectId: string | null;
  from: CalendarDate | null;
  to: CalendarDate | null;
  cursor: string | null;
};

/**
 * An entry of a Site Engineer's or a Vendor's feed (ADR CM-0044 §7): the
 * Labour feed's shapes for the same facts. Project changes carry no
 * remark, so it is always null.
 */
export type PersonActivityEntry = Extract<
  LabourActivityEntry,
  { kind: "project_added" | "project_removed" | "check_in" }
>;

/** Ranks within one day and recorded time; higher shows first. */
const RANK = {
  project_added: 2,
  project_removed: 4,
  /** Set by the labour context's check-in source. */
  check_in: LABOUR_ACTIVITY_RANK.check_in,
} as const;

/** One Project a person was put on or taken off by one audited command. */
type ProjectChange = {
  projectId: string;
  change: "added" | "removed";
  eventId: string;
  occurredAt: Date;
  by: string;
};

type ProjectRow = {
  key: ActivityKey;
  kind: "project_added" | "project_removed";
  projectId: string;
  by: string;
};

type Row = ProjectRow | CheckInActivityRow;

/**
 * Project changes as feed rows: dated the day they were recorded in the
 * Company's time zone, on the Projects the window allows, after its cursor.
 */
function projectRows(
  changes: readonly ProjectChange[],
  window: PersonActivityWindow & { timeZone: string },
): ProjectRow[] {
  const { visibleProjectIds: visible, projectId } = window;
  const rows = changes
    .filter(
      (change) =>
        (projectId == null || change.projectId === projectId) &&
        (visible == null || visible.includes(change.projectId)),
    )
    .map((change): ProjectRow => ({
      key: {
        date: todayIn(window.timeZone, change.occurredAt),
        recordedAt: change.occurredAt,
        rank:
          change.change === "added" ? RANK.project_added : RANK.project_removed,
        // One event can add several Projects; each needs a key of its own.
        id: activityPartId(change.eventId, change.projectId),
      },
      kind: change.change === "added" ? "project_added" : "project_removed",
      projectId: change.projectId,
      by: change.by,
    }))
    .filter(
      (row) =>
        (window.from == null || row.key.date >= window.from) &&
        (window.to == null || row.key.date <= window.to),
    );
  return pageAfter(rows, window.before, window.limit);
}

/** Every Project change of the person, any order. */
type ProjectChanges = (
  window: PersonActivityWindow,
) => Promise<readonly ProjectChange[]>;

/** What both feeds read besides their own Project history. */
export type PersonActivityDeps = {
  labour: LabourActivitySource;
  projectNames: ProjectNames;
  actorNames: ActorNames;
  timeZoneOf: (workspaceId: string) => Promise<string>;
};

/**
 * One page of a person's feed: their Project changes and their check-in
 * entries, merged in feed order, 30 a page. Entries of Projects the viewer
 * may not open are left out, and check-in entries of Projects without
 * Attendance Read (ADR CM-0044 §4). No amounts.
 */
async function personFeed(
  deps: PersonActivityDeps,
  access: MemberAccess,
  person: { kind: CheckInPersonKind; id: string },
  filter: PersonActivityFilter,
  projectChanges: ProjectChanges,
): Promise<ActivityPage<PersonActivityEntry>> {
  const { workspaceId } = access;
  const timeZone = await deps.timeZoneOf(workspaceId);
  const window: PersonActivityWindow = {
    workspaceId,
    before: filter.cursor == null ? null : decodeActivityCursor(filter.cursor),
    limit: ACTIVITY_PAGE_SIZE + 1,
    projectId: filter.projectId,
    visibleProjectIds: visibleProjectIds(access),
    from: filter.from,
    to: filter.to,
  };
  const wants = (type: PersonActivityType) =>
    filter.type === "all" || filter.type === type;
  const [moves, checkIns] = await Promise.all([
    wants("projects") && window.visibleProjectIds?.length !== 0
      ? projectChanges(window).then((changes) =>
          projectRows(changes, { ...window, timeZone }),
        )
      : Promise.resolve([]),
    wants("check_ins")
      ? deps.labour.checkIns({
          ...window,
          person,
          visibleProjectIds: checkInProjectIds(access),
        })
      : Promise.resolve([]),
  ]);
  const page = mergeActivity<Row>([moves, checkIns]);
  const project = await resolveProjects(
    deps.projectNames,
    access,
    page.items.map((row) => row.projectId),
  );
  const names = await deps.actorNames(
    workspaceId,
    page.items.map((row) => row.by),
  );
  return {
    items: page.items.map((row): PersonActivityEntry => {
      const base = {
        id: `${row.kind}:${row.key.id}`,
        date: row.key.date,
        recordedAt: row.key.recordedAt,
        by: names.get(row.by) ?? null,
        project: project(row.projectId),
      };
      return row.kind === "check_in"
        ? { ...base, kind: row.kind, ...activityCheckIn(row) }
        : { ...base, kind: row.kind, remark: null };
    }),
    nextCursor: page.next == null ? null : encodeActivityCursor(page.next),
    timeZone,
  };
}

/** A live Site Engineer and the sign-in their row points at (masters). */
export type SiteEngineerSignInOf = (
  workspaceId: string,
  id: string,
) => Promise<{ teamMemberId: string | null } | null>;

/**
 * A Site Engineer's Activity feed (ADR CM-0044 §7): their check-in entries
 * (labour context), and the Projects their sign-in was added to and
 * removed from (organization context, the source the Project feed reads),
 * dated the day it was recorded in the Company's time zone. A Site
 * Engineer without a sign-in has no Project history.
 */
export class SiteEngineerActivityService {
  constructor(
    private readonly deps: PersonActivityDeps,
    private readonly siteEngineer: SiteEngineerSignInOf,
    private readonly signIns: SignInProjectHistory,
  ) {}

  /** 404 `SUPERVISOR_NOT_FOUND` for another Company's or a deleted Site Engineer. */
  async feed(
    access: MemberAccess,
    id: string,
    filter: PersonActivityFilter,
  ): Promise<ActivityPage<PersonActivityEntry>> {
    const found = await this.siteEngineer(access.workspaceId, id);
    if (found == null) throw masterNotFound("supervisor");
    const memberId = found.teamMemberId;
    return personFeed(
      this.deps,
      access,
      { kind: "site_engineer", id },
      filter,
      async (window) =>
        memberId == null
          ? []
          : this.signIns.projectChanges(
              window.workspaceId,
              [memberId],
              window.projectId,
            ),
    );
  }
}

/**
 * A Vendor's Activity feed (ADR CM-0044 §7): their check-in entries and
 * the Projects they were added to and removed from, both from the labour
 * context (the latter from the Vendor's audit events). The Vendor's
 * attendance headcount is not in it.
 */
export class VendorActivityService {
  constructor(private readonly deps: PersonActivityDeps) {}

  /** 404 `VENDOR_NOT_FOUND` for another Company's or a deleted Vendor. */
  async feed(
    access: MemberAccess,
    id: string,
    filter: PersonActivityFilter,
  ): Promise<ActivityPage<PersonActivityEntry>> {
    const found = await this.deps.labour.vendor(access.workspaceId, id);
    if (found == null)
      throw notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
    return personFeed(
      this.deps,
      access,
      { kind: "vendor", id },
      filter,
      (window) => this.deps.labour.vendorProjectChanges(window.workspaceId, id),
    );
  }
}

function prismaDeps(db: PrismaClient): PersonActivityDeps {
  return {
    labour: new PrismaLabourActivity(db),
    projectNames: (workspaceId, ids) => projectNames(workspaceId, ids, db),
    actorNames: companyActorNames(db),
    timeZoneOf: (workspaceId) => companyTimezone(db, workspaceId),
  };
}

/** The Prisma-backed compositions the routes use. */
export function createSiteEngineerActivity(deps?: {
  prisma?: PrismaClient;
}): SiteEngineerActivityService {
  const db = deps?.prisma ?? prisma;
  return new SiteEngineerActivityService(
    prismaDeps(db),
    (workspaceId, id) => siteEngineerSignIn(workspaceId, id, db),
    new PrismaSignInProjectHistory(db),
  );
}

export function createVendorActivity(deps?: {
  prisma?: PrismaClient;
}): VendorActivityService {
  return new VendorActivityService(prismaDeps(deps?.prisma ?? prisma));
}
