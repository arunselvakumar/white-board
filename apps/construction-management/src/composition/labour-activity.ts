import { prisma, type PrismaClient } from "@repo/construction-db";

import type {
  AttendanceLabel,
  CheckInActivityRow,
  LabourActivityRow,
  LabourActivitySource,
  LabourActivityWindow,
} from "@/src/labour/application/labour-activity-ports";
import { PrismaLabourActivity } from "@/src/labour/infrastructure/prisma-labour-activity";
import { projectNames } from "@/src/projects/infrastructure/prisma-project-names";
import { can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  ACTIVITY_PAGE_SIZE,
  decodeActivityCursor,
  encodeActivityCursor,
  mergeActivity,
} from "@/src/shared-kernel/activity-key";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { notFound } from "@/src/shared-kernel/domain-error";
import {
  fillDeletedUserNames,
  userNamesInCompany,
} from "@/src/shared-kernel/user-names";

/** What a feed says about a Project: its name, kept after it was deleted. */
export type ActivityProject = {
  id: string;
  name: string;
  /** The viewer may open it: live, and they are on it (or the Owner). */
  canOpen: boolean;
};

/** Shown for a Project whose row is gone. */
export const DELETED_PROJECT_NAME = "Deleted Project";

type EntryBase = {
  /** Unique within the feed. */
  id: string;
  /** The day it applies to (ADR CM-0038 §1). */
  date: CalendarDate;
  recordedAt: Date;
  /** Who recorded it; null when the name is unknown. */
  by: string | null;
};

/**
 * What a feed says about a check-in entry (ADR CM-0044 §2), without money.
 * The photo is served by the Check-In log's route, by `entryId`.
 */
export type ActivityCheckIn = {
  action: CheckInActivityRow["action"];
  /** The instant it happened; also `recordedAt`. */
  at: Date;
  /** The check-in entry, for its photo. */
  entryId: string;
  hasPhoto: boolean;
  location: CheckInActivityRow["location"];
  fence: CheckInActivityRow["fence"];
  metresOutside: number | null;
  voided: { reason: string } | null;
};

/** Check-in entries need Attendance Read on their Project (ADR CM-0044 §4). */
export const CHECK_IN_MENU = "labour.attendance";

export function activityCheckIn(row: CheckInActivityRow): ActivityCheckIn {
  return {
    action: row.action,
    at: row.key.recordedAt,
    entryId: row.key.id,
    hasPhoto: row.hasPhoto,
    location: row.location,
    fence: row.fence,
    metresOutside: row.metresOutside,
    voided: row.voided,
  };
}

export type LabourActivityEntry = EntryBase &
  (
    | { kind: "added"; imported: boolean }
    | { kind: "activated" | "deactivated" }
    | {
        kind: "project_added" | "project_removed";
        project: ActivityProject;
        remark: string | null;
      }
    | {
        kind: "transferred";
        fromProject: ActivityProject;
        toProject: ActivityProject;
        remark: string | null;
      }
    | {
        kind: "attendance";
        project: ActivityProject;
        status: AttendanceLabel;
        shift: string | null;
        checkIn: string | null;
        checkOut: string | null;
        overtimeHours: string | null;
      }
    | {
        kind: "attendance_changed";
        project: ActivityProject;
        fromStatus: AttendanceLabel;
        toStatus: AttendanceLabel;
      }
    | {
        kind: "attendance_cleared";
        project: ActivityProject;
        status: AttendanceLabel;
      }
    | ({ kind: "check_in"; project: ActivityProject } & ActivityCheckIn)
  );

export const LABOUR_ACTIVITY_TYPES = [
  "all",
  "projects",
  "attendance",
  "check_ins",
  "profile",
] as const;
export type LabourActivityType = (typeof LABOUR_ACTIVITY_TYPES)[number];

export type LabourActivityFilter = {
  type: LabourActivityType;
  projectId: string | null;
  from: CalendarDate | null;
  to: CalendarDate | null;
  cursor: string | null;
};

export type ActivityPage<Entry> = {
  items: Entry[];
  nextCursor: string | null;
  /** The Company's time zone, for showing recorded times. */
  timeZone: string;
};

/** Names actors by User id; a removed Team Member keeps their name. */
export type ActorNames = (
  workspaceId: string,
  userIds: readonly string[],
) => Promise<Map<string, string>>;

export type ProjectNames = (
  workspaceId: string,
  ids: readonly string[],
) => Promise<Map<string, { name: string; deleted: boolean }>>;

/** The Projects a viewer may open; null for every one (the Owner). */
export function visibleProjectIds(
  access: Pick<MemberAccess, "role" | "projectIds">,
): string[] | null {
  return access.role === "owner" ? null : [...access.projectIds];
}

/**
 * The Projects whose check-in entries the viewer may see: those they have
 * Attendance Read on, which is project-scoped, so the Projects they are on
 * when they hold it (ADR CM-0044 §4). Null for every one (the Owner).
 */
export function checkInProjectIds(access: MemberAccess): string[] | null {
  if (!can(access, CHECK_IN_MENU, "read")) return [];
  return visibleProjectIds(access);
}

/** Names the Projects of a page and says which the viewer may open. */
export async function resolveProjects(
  names: ProjectNames,
  access: Pick<MemberAccess, "workspaceId" | "role" | "projectIds">,
  ids: readonly (string | null)[],
): Promise<(id: string) => ActivityProject> {
  const found = await names(
    access.workspaceId,
    ids.filter((id): id is string => id != null),
  );
  return (id) => {
    const project = found.get(id);
    return {
      id,
      name: project?.name ?? DELETED_PROJECT_NAME,
      canOpen:
        project != null &&
        !project.deleted &&
        (access.role === "owner" || access.projectIds.has(id)),
    };
  };
}

const MORE = 1;

/**
 * A Labour's Activity feed (ADR CM-0038 §1, §5): Project moves, attendance
 * and its changes, check-in entries (ADR CM-0044) and the profile entries,
 * read from the labour context's history and merged here. Entries for
 * Projects the viewer may not open are left out at the source, and
 * check-in entries of Projects without Attendance Read too; entries with
 * no Project always show. A transfer shows when the viewer may open either
 * Project; the other one is named without a link. No amounts are returned.
 */
export class LabourActivityService {
  constructor(
    private readonly source: LabourActivitySource,
    private readonly projectNames: ProjectNames,
    private readonly actorNames: ActorNames,
    private readonly timeZoneOf: (workspaceId: string) => Promise<string>,
  ) {}

  async feed(
    access: MemberAccess,
    labourId: string,
    filter: LabourActivityFilter,
  ): Promise<ActivityPage<LabourActivityEntry>> {
    const { workspaceId } = access;
    const labour = await this.source.find(workspaceId, labourId);
    if (labour == null)
      throw notFound("LABOUR_NOT_FOUND", "This Labour was not found.");
    const timeZone = await this.timeZoneOf(workspaceId);
    const window: LabourActivityWindow = {
      workspaceId,
      labourId,
      before:
        filter.cursor == null ? null : decodeActivityCursor(filter.cursor),
      limit: ACTIVITY_PAGE_SIZE + MORE,
      projectId: filter.projectId,
      visibleProjectIds: visibleProjectIds(access),
      from: filter.from,
      to: filter.to,
    };
    const wants = (type: LabourActivityType) =>
      filter.type === "all" || filter.type === type;
    const none = Promise.resolve([]);
    const [moves, attendance, checkIns, profile] = await Promise.all([
      wants("projects") ? this.source.moves(window) : none,
      wants("attendance") ? this.source.attendance(window) : none,
      wants("check_ins")
        ? this.source.checkIns({
            ...window,
            visibleProjectIds: checkInProjectIds(access),
          })
        : none,
      wants("profile") ? this.source.profile({ ...window, timeZone }) : none,
    ]);
    // A change dated before the page's last entry so far cannot be on it.
    const sofar = mergeActivity<LabourActivityRow>(
      [moves, attendance, checkIns, profile],
      window.limit,
    );
    const since =
      sofar.items.length < window.limit
        ? null
        : (sofar.items.at(-1)?.key.date ?? null);
    const changes = wants("attendance")
      ? await this.source.attendanceChanges({ ...window, since })
      : [];
    const page = mergeActivity<LabourActivityRow>([sofar.items, changes]);

    const project = await resolveProjects(
      this.projectNames,
      access,
      page.items.flatMap((row) =>
        row.kind === "transferred"
          ? [row.fromProjectId, row.toProjectId]
          : "projectId" in row
            ? [row.projectId]
            : row.kind === "project_added"
              ? [row.toProjectId]
              : row.kind === "project_removed"
                ? [row.fromProjectId]
                : [],
      ),
    );
    const names = await this.actorNames(
      workspaceId,
      page.items.map((row) => row.by),
    );
    return {
      items: page.items.map((row) =>
        toEntry(row, project, names.get(row.by) ?? null),
      ),
      nextCursor: page.next == null ? null : encodeActivityCursor(page.next),
      timeZone,
    };
  }
}

function toEntry(
  row: LabourActivityRow,
  project: (id: string) => ActivityProject,
  by: string | null,
): LabourActivityEntry {
  const base = {
    id: `${row.kind}:${row.key.id}`,
    date: row.key.date,
    recordedAt: row.key.recordedAt,
    by,
  };
  switch (row.kind) {
    case "added":
      return { ...base, kind: row.kind, imported: row.imported };
    case "activated":
    case "deactivated":
      return { ...base, kind: row.kind };
    case "project_added":
      return {
        ...base,
        kind: row.kind,
        project: project(row.toProjectId ?? ""),
        remark: row.remark,
      };
    case "project_removed":
      return {
        ...base,
        kind: row.kind,
        project: project(row.fromProjectId ?? ""),
        remark: row.remark,
      };
    case "transferred":
      return {
        ...base,
        kind: row.kind,
        fromProject: project(row.fromProjectId ?? ""),
        toProject: project(row.toProjectId ?? ""),
        remark: row.remark,
      };
    case "attendance":
      return {
        ...base,
        kind: row.kind,
        project: project(row.projectId),
        status: row.status,
        shift: row.shift,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        overtimeHours: row.overtimeHours,
      };
    case "attendance_changed":
      return {
        ...base,
        kind: row.kind,
        project: project(row.projectId),
        fromStatus: row.from,
        toStatus: row.to ?? row.from,
      };
    case "attendance_cleared":
      return {
        ...base,
        kind: row.kind,
        project: project(row.projectId),
        status: row.from,
      };
    case "check_in":
      return {
        ...base,
        kind: row.kind,
        project: project(row.projectId),
        ...activityCheckIn(row),
      };
  }
}

/** Actor names from the Company's Team Members, "Deleted user" after an account deletion. */
export function companyActorNames(db: PrismaClient = prisma): ActorNames {
  return async (workspaceId, userIds) =>
    fillDeletedUserNames(
      db,
      userIds,
      await userNamesInCompany(db, workspaceId, userIds),
    );
}

/** The Prisma-backed composition the route uses. */
export function createLabourActivity(deps?: {
  prisma?: PrismaClient;
}): LabourActivityService {
  const db = deps?.prisma ?? prisma;
  return new LabourActivityService(
    new PrismaLabourActivity(db),
    (workspaceId, ids) => projectNames(workspaceId, ids, db),
    companyActorNames(db),
    (workspaceId) => companyTimezone(db, workspaceId),
  );
}
