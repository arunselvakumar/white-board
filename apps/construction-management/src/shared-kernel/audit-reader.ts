import { Prisma, type PrismaClient } from "@repo/construction-db";

/**
 * Reads `construction_organization.audit_events` for the Activity feeds
 * (ADR CM-0038 §1). The payload fields a feed relies on are read here and
 * only here, so a change to what a command records changes this file too.
 */

type Db = Pick<
  PrismaClient,
  "constructionOrganizationAuditEvent" | "$queryRaw"
>;

export type AuditRecord = {
  id: string;
  action: string;
  entityId: string;
  actorUserId: string;
  occurredAt: Date;
  before: unknown;
  after: unknown;
};

const SELECT = {
  id: true,
  action: true,
  entityId: true,
  actorUserId: true,
  occurredAt: true,
  before: true,
  after: true,
} as const;

/** Events of these entities with one of these actions, oldest first. */
export async function readAuditEvents(
  db: Db,
  input: {
    workspaceId: string;
    entityType: string;
    entityIds: readonly string[];
    /** Every action when left out. */
    actions?: readonly string[];
  },
): Promise<AuditRecord[]> {
  if (input.entityIds.length === 0) return [];
  return db.constructionOrganizationAuditEvent.findMany({
    where: {
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: { in: [...new Set(input.entityIds)] },
      ...(input.actions == null ? {} : { action: { in: [...input.actions] } }),
    },
    select: SELECT,
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
}

/**
 * `labour.imported` events whose `after.labourIds` lists the labourer: one
 * import writes one event for every row it added (`labour-import.ts`).
 */
export async function readLabourImports(
  db: Db,
  workspaceId: string,
  labourId: string,
): Promise<AuditRecord[]> {
  return db.$queryRaw<AuditRecord[]>(Prisma.sql`
    SELECT id::text AS id, action, entity_id AS "entityId",
      actor_user_id AS "actorUserId", occurred_at AS "occurredAt",
      before, after
    FROM construction_organization.audit_events
    WHERE workspace_id = ${workspaceId}
      AND entity_type = 'labour'
      AND action = 'labour.imported'
      AND after -> 'labourIds' @> to_jsonb(${labourId}::text)
    ORDER BY occurred_at, id
  `);
}

export const ATTENDANCE_STATUSES = [
  "present",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** What a labour attendance event keeps of the day (`labour-attendance-store.ts` `snapshot`). */
export type AttendanceAuditDay = {
  labourId: string;
  projectId: string;
  date: string;
  status: AttendanceStatus;
  isPaidLeave: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The day in a `labour_attendance.*` event's `before` or `after`, or null. */
export function attendanceAuditDay(value: unknown): AttendanceAuditDay | null {
  const day = record(value);
  if (day == null) return null;
  const { labourId, projectId, date, status, isPaidLeave } = day;
  if (
    typeof labourId !== "string" ||
    typeof projectId !== "string" ||
    typeof date !== "string" ||
    typeof status !== "string" ||
    !(ATTENDANCE_STATUSES as readonly string[]).includes(status)
  )
    return null;
  return {
    labourId,
    projectId,
    date,
    status: status as AttendanceStatus,
    isPaidLeave: isPaidLeave === true,
  };
}

/**
 * The Team Member's Projects after a `team_member.*` event
 * (`team-member-handlers.ts` `audit`), or null when the event does not
 * carry them (a password set, a photo change).
 */
export function teamMemberProjectIdsAfter(
  event: Pick<AuditRecord, "after">,
): string[] | null {
  const projectIds = record(event.after)?.["projectIds"];
  if (!Array.isArray(projectIds)) return null;
  return projectIds.filter((id): id is string => typeof id === "string");
}
