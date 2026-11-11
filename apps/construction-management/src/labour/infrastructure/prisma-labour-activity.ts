import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { pageAfter, type ActivityKey } from "@/src/shared-kernel/activity-key";
import {
  attendanceAuditDay,
  readAuditEvents,
  readLabourImports,
  type AttendanceAuditDay,
} from "@/src/shared-kernel/audit-reader";
import {
  calendarDateFromDb,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import {
  LABOUR_ACTIVITY_RANK,
  PROJECT_LABOUR_ACTIVITY_RANK,
  type ActivityLabour,
  type AttendanceLabel,
  type LabourActivitySource,
  type LabourActivityWindow,
  type LabourAttendanceChangeRow,
  type LabourAttendanceRow,
  type LabourMoveRow,
  type LabourProfileRow,
  type ProjectActivityWindow,
  type ProjectLabourMoveKind,
  type ProjectLabourMoveRow,
} from "../application/labour-activity-ports";
import { PrismaDirectories } from "./prisma-directories";

type Sql = Prisma.Sql;

/** `AND (date, recorded, rank, id) < cursor`: rows after the cursor in feed order. */
function afterCursor(
  cursor: ActivityKey | null,
  columns: { date: string; recordedAt: string; rank: string; id: string },
): Sql {
  if (cursor == null) return Prisma.empty;
  return Prisma.sql`AND (${Prisma.raw(columns.date)}, ${Prisma.raw(columns.recordedAt)}, ${Prisma.raw(columns.rank)}, ${Prisma.raw(columns.id)})
    < (${cursor.date}::date, ${cursor.recordedAt}::timestamptz, ${cursor.rank}::int, ${cursor.id}::uuid)`;
}

function dateRange(
  column: string,
  from: CalendarDate | null,
  to: CalendarDate | null,
): Sql {
  return Prisma.sql`${from == null ? Prisma.empty : Prisma.sql`AND ${Prisma.raw(column)} >= ${from}::date`}
    ${to == null ? Prisma.empty : Prisma.sql`AND ${Prisma.raw(column)} <= ${to}::date`}`;
}

function label(
  day: Pick<AttendanceAuditDay, "status" | "isPaidLeave">,
): AttendanceLabel {
  return day.status === "on_leave" && day.isPaidLeave
    ? "paid_leave"
    : day.status;
}

/** "1.50" → "1.5"; null for none. */
function hours(value: string | null): string | null {
  if (value == null) return null;
  const number = Number(value);
  return number > 0 ? String(number) : null;
}

type MoveSqlRow = {
  id: string;
  eff: string;
  recorded_at: Date;
  rank: number;
  from_project_id: string | null;
  to_project_id: string | null;
  remark: string | null;
  created_by: string;
};

type AttendanceSqlRow = {
  id: string;
  eff: string;
  recorded_at: Date;
  rank: number;
  project_id: string;
  status: AttendanceAuditDay["status"];
  is_paid_leave: boolean;
  shift: string | null;
  check_in: string | null;
  check_out: string | null;
  overtime_hours: string | null;
  created_by: string;
};

type ProjectMoveSqlRow = {
  id: string;
  eff: string;
  recorded_at: Date;
  rank: number;
  kind: ProjectLabourMoveKind;
  other_project_id: string | null;
  labour_ids: string[];
  remark: string | null;
  created_by: string;
};

/**
 * The labour context's reads for the Activity feeds (ADR CM-0038 §1):
 * `labour_transfers`, `labour_attendance`, and the labourer's and their
 * attendance rows' audit events through the shared-kernel reader.
 */
export class PrismaLabourActivity implements LabourActivitySource {
  private readonly directories: PrismaDirectories;

  constructor(private readonly db: PrismaClient = prisma) {
    this.directories = new PrismaDirectories(db);
  }

  async find(workspaceId: string, labourId: string) {
    return this.db.constructionLabourLabour.findFirst({
      where: { id: labourId, workspaceId, deletedAt: null },
      select: { id: true },
    });
  }

  async moves(window: LabourActivityWindow): Promise<LabourMoveRow[]> {
    const { visibleProjectIds: visible, projectId } = window;
    const rows = await this.db.$queryRaw<MoveSqlRow[]>(Prisma.sql`
      SELECT m.id::text AS id, to_char(m.eff_date, 'YYYY-MM-DD') AS eff,
        m.recorded_at, m.rank, m.from_project_id, m.to_project_id, m.remark,
        m.created_by
      FROM (
        SELECT t.id, t.from_project_id::text AS from_project_id,
          t.to_project_id::text AS to_project_id, t.remark, t.created_by,
          t.created_at AS recorded_at,
          CASE WHEN t.to_project_id IS NULL THEN t.transfer_date - 1 ELSE t.transfer_date END AS eff_date,
          CASE
            WHEN t.from_project_id IS NULL THEN ${LABOUR_ACTIVITY_RANK.project_added}::int
            WHEN t.to_project_id IS NULL THEN ${LABOUR_ACTIVITY_RANK.project_removed}::int
            ELSE ${LABOUR_ACTIVITY_RANK.transferred}::int
          END AS rank
        FROM construction_labour.labour_transfers t
        WHERE t.workspace_id = ${window.workspaceId}
          AND t.labour_id = ${window.labourId}::uuid
          ${
            projectId == null
              ? Prisma.empty
              : Prisma.sql`AND (t.from_project_id = ${projectId}::uuid OR t.to_project_id = ${projectId}::uuid)`
          }
          ${
            visible == null
              ? Prisma.empty
              : Prisma.sql`AND (t.from_project_id = ANY(${visible}::uuid[]) OR t.to_project_id = ANY(${visible}::uuid[]))`
          }
      ) m
      WHERE TRUE
        ${dateRange("m.eff_date", window.from, window.to)}
        ${afterCursor(window.before, { date: "m.eff_date", recordedAt: "m.recorded_at", rank: "m.rank", id: "m.id" })}
      ORDER BY m.eff_date DESC, m.recorded_at DESC, m.rank DESC, m.id DESC
      LIMIT ${window.limit}
    `);
    return rows.map((row) => ({
      key: {
        date: row.eff,
        recordedAt: row.recorded_at,
        rank: row.rank,
        id: row.id,
      },
      kind:
        row.from_project_id == null
          ? "project_added"
          : row.to_project_id == null
            ? "project_removed"
            : "transferred",
      fromProjectId: row.from_project_id,
      toProjectId: row.to_project_id,
      remark: row.remark,
      by: row.created_by,
    }));
  }

  private projectScope(window: LabourActivityWindow): Sql {
    const { visibleProjectIds: visible, projectId } = window;
    return Prisma.sql`${
      projectId == null
        ? Prisma.empty
        : Prisma.sql`AND a.project_id = ${projectId}::uuid`
    } ${
      visible == null
        ? Prisma.empty
        : Prisma.sql`AND a.project_id = ANY(${visible}::uuid[])`
    }`;
  }

  async attendance(
    window: LabourActivityWindow,
  ): Promise<LabourAttendanceRow[]> {
    const rank = LABOUR_ACTIVITY_RANK.attendance;
    const rows = await this.db.$queryRaw<AttendanceSqlRow[]>(Prisma.sql`
      SELECT a.id::text AS id, to_char(a.attendance_date, 'YYYY-MM-DD') AS eff,
        a.created_at AS recorded_at, ${rank}::int AS rank,
        a.project_id::text AS project_id, a.status::text AS status,
        a.is_paid_leave, a.shift, a.check_in, a.check_out, a.created_by,
        (SELECT SUM(o.hours)::text FROM construction_labour.labour_overtime o
          WHERE o.attendance_id = a.id) AS overtime_hours
      FROM construction_labour.labour_attendance a
      WHERE a.workspace_id = ${window.workspaceId}
        AND a.labour_id = ${window.labourId}::uuid
        AND a.deleted_at IS NULL
        ${this.projectScope(window)}
        ${dateRange("a.attendance_date", window.from, window.to)}
        ${afterCursor(window.before, { date: "a.attendance_date", recordedAt: "a.created_at", rank: String(rank), id: "a.id" })}
      ORDER BY a.attendance_date DESC, a.created_at DESC, a.id DESC
      LIMIT ${window.limit}
    `);
    return rows.map((row) => ({
      key: {
        date: row.eff,
        recordedAt: row.recorded_at,
        rank: row.rank,
        id: row.id,
      },
      kind: "attendance",
      projectId: row.project_id,
      status: label({ status: row.status, isPaidLeave: row.is_paid_leave }),
      shift: row.shift,
      checkIn: row.check_in?.trim() ?? null,
      checkOut: row.check_out?.trim() ?? null,
      overtimeHours: hours(row.overtime_hours),
      by: row.created_by,
    }));
  }

  async attendanceChanges(
    window: LabourActivityWindow & { since: CalendarDate | null },
  ): Promise<LabourAttendanceChangeRow[]> {
    const from =
      window.since == null
        ? window.from
        : window.from == null || window.since > window.from
          ? window.since
          : window.from;
    const to =
      window.before == null
        ? window.to
        : window.to == null || window.before.date < window.to
          ? window.before.date
          : window.to;
    // Cleared rows count: a cleared day keeps its tombstone and its events.
    const days = await this.db.$queryRaw<
      { id: string; eff: string; project_id: string }[]
    >(Prisma.sql`
      SELECT a.id::text AS id, to_char(a.attendance_date, 'YYYY-MM-DD') AS eff,
        a.project_id::text AS project_id
      FROM construction_labour.labour_attendance a
      WHERE a.workspace_id = ${window.workspaceId}
        AND a.labour_id = ${window.labourId}::uuid
        ${this.projectScope(window)}
        ${dateRange("a.attendance_date", from, to)}
    `);
    if (days.length === 0) return [];
    const byId = new Map(days.map((day) => [day.id, day]));
    const events = await readAuditEvents(this.db, {
      workspaceId: window.workspaceId,
      entityType: "labour_attendance",
      entityIds: [...byId.keys()],
      actions: [
        "labour_attendance.updated",
        "labour_attendance.paid_leave_changed",
        "labour_attendance.cleared",
      ],
    });
    const rows: LabourAttendanceChangeRow[] = [];
    for (const event of events) {
      const day = byId.get(event.entityId);
      const before = attendanceAuditDay(event.before);
      if (day == null || before == null) continue;
      if (event.action === "labour_attendance.cleared") {
        rows.push({
          key: {
            date: day.eff,
            recordedAt: event.occurredAt,
            rank: LABOUR_ACTIVITY_RANK.attendance_cleared,
            id: event.id,
          },
          kind: "attendance_cleared",
          projectId: day.project_id,
          from: label(before),
          to: null,
          by: event.actorUserId,
        });
        continue;
      }
      const after = attendanceAuditDay(event.after);
      if (after == null || label(after) === label(before)) continue;
      rows.push({
        key: {
          date: day.eff,
          recordedAt: event.occurredAt,
          rank: LABOUR_ACTIVITY_RANK.attendance_changed,
          id: event.id,
        },
        kind: "attendance_changed",
        projectId: day.project_id,
        from: label(before),
        to: label(after),
        by: event.actorUserId,
      });
    }
    return pageAfter(rows, window.before, window.limit);
  }

  async profile(
    window: LabourActivityWindow & { timeZone: string },
  ): Promise<LabourProfileRow[]> {
    // Profile entries name no Project.
    if (window.projectId != null) return [];
    const labour = await this.db.constructionLabourLabour.findFirst({
      where: { id: window.labourId, workspaceId: window.workspaceId },
      select: { id: true, joiningDate: true, createdAt: true, createdBy: true },
    });
    if (labour == null) return [];
    const [imports, events] = await Promise.all([
      readLabourImports(this.db, window.workspaceId, labour.id),
      readAuditEvents(this.db, {
        workspaceId: window.workspaceId,
        entityType: "labour",
        entityIds: [labour.id],
        actions: ["labour.activated", "labour.deactivated"],
      }),
    ]);
    const rows: LabourProfileRow[] = [
      {
        key: {
          date: calendarDateFromDb(labour.joiningDate),
          recordedAt: labour.createdAt,
          rank: LABOUR_ACTIVITY_RANK.added,
          id: labour.id,
        },
        kind: "added",
        imported: imports.length > 0,
        by: labour.createdBy,
      },
      ...events.map((event): LabourProfileRow => ({
        key: {
          date: todayIn(window.timeZone, event.occurredAt),
          recordedAt: event.occurredAt,
          rank: LABOUR_ACTIVITY_RANK.activated,
          id: event.id,
        },
        kind: event.action === "labour.activated" ? "activated" : "deactivated",
        imported: false,
        by: event.actorUserId,
      })),
    ];
    return pageAfter(
      rows.filter(
        (row) =>
          (window.from == null || row.key.date >= window.from) &&
          (window.to == null || row.key.date <= window.to),
      ),
      window.before,
      window.limit,
    );
  }

  async projectMoves(
    window: ProjectActivityWindow,
  ): Promise<ProjectLabourMoveRow[]> {
    const project = window.projectId;
    const rank = PROJECT_LABOUR_ACTIVITY_RANK;
    const rows = await this.db.$queryRaw<ProjectMoveSqlRow[]>(Prisma.sql`
      WITH moves AS (
        SELECT t.id, t.labour_id, t.transfer_date, t.remark, t.created_at,
          t.created_by,
          CASE
            WHEN t.to_project_id = ${project}::uuid AND t.from_project_id IS NULL THEN 'labour_added'
            WHEN t.to_project_id = ${project}::uuid THEN 'transferred_in'
            WHEN t.to_project_id IS NULL THEN 'labour_removed'
            ELSE 'transferred_out'
          END AS kind,
          CASE WHEN t.to_project_id = ${project}::uuid THEN t.from_project_id ELSE t.to_project_id END
            AS other_project_id
        FROM construction_labour.labour_transfers t
        WHERE t.workspace_id = ${window.workspaceId}
          AND (t.to_project_id = ${project}::uuid OR t.from_project_id = ${project}::uuid)
      ), batches AS (
        SELECT kind, other_project_id, remark, created_by,
          created_at AS recorded_at,
          CASE WHEN kind = 'labour_removed' THEN transfer_date - 1 ELSE transfer_date END AS eff_date,
          CASE kind
            WHEN 'labour_added' THEN ${rank.labour_added}::int
            WHEN 'transferred_in' THEN ${rank.transferred_in}::int
            WHEN 'transferred_out' THEN ${rank.transferred_out}::int
            ELSE ${rank.labour_removed}::int
          END AS rank,
          (array_agg(id ORDER BY id))[1] AS id,
          array_agg(labour_id::text ORDER BY labour_id) AS labour_ids
        FROM moves
        GROUP BY kind, other_project_id, transfer_date, remark, created_at, created_by
      )
      SELECT b.id::text AS id, to_char(b.eff_date, 'YYYY-MM-DD') AS eff,
        b.recorded_at, b.rank, b.kind, b.other_project_id::text AS other_project_id,
        b.labour_ids, b.remark, b.created_by
      FROM batches b
      WHERE TRUE
        ${dateRange("b.eff_date", window.from, window.to)}
        ${afterCursor(window.before, { date: "b.eff_date", recordedAt: "b.recorded_at", rank: "b.rank", id: "b.id" })}
      ORDER BY b.eff_date DESC, b.recorded_at DESC, b.rank DESC, b.id DESC
      LIMIT ${window.limit}
    `);
    return rows.map((row) => ({
      key: {
        date: row.eff,
        recordedAt: row.recorded_at,
        rank: row.rank,
        id: row.id,
      },
      kind: row.kind,
      otherProjectId: row.other_project_id,
      labourIds: row.labour_ids,
      remark: row.remark,
      by: row.created_by,
    }));
  }

  async labours(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ActivityLabour>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionLabourLabour.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        name: true,
        labourCode: true,
        labourCategoryId: true,
        deletedAt: true,
      },
    });
    const categories = await this.directories.labourCategories.find(
      workspaceId,
      rows.flatMap((row) =>
        row.labourCategoryId == null ? [] : [row.labourCategoryId],
      ),
    );
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          labourCode: row.labourCode,
          labourCategory:
            row.labourCategoryId == null
              ? null
              : (categories.get(row.labourCategoryId)?.name ?? null),
          deleted: row.deletedAt != null,
        },
      ]),
    );
  }
}
