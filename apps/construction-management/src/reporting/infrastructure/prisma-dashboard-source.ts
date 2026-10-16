import { Prisma, type PrismaClient } from "@repo/construction-db";

import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";

import type {
  DashboardPartyDue,
  DashboardPartyType,
  DashboardSource,
  PendingTracking,
} from "../application/dashboard-ports";
import { isApprovalModule, noApprovals } from "../domain/dashboard-approvals";
import type { ApprovalCounts } from "../domain/dashboard-approvals";
import {
  DASHBOARD_PROJECT_STATUSES,
  type DashboardProjectStatus,
} from "../domain/company-dashboard";

const PARTY_TYPES: readonly DashboardPartyType[] = [
  "contractor",
  "supplier",
  "other_party",
];

function isPartyType(value: string): value is DashboardPartyType {
  return (PARTY_TYPES as readonly string[]).includes(value);
}

function isProjectStatus(value: string): value is DashboardProjectStatus {
  return (DASHBOARD_PROJECT_STATUSES as readonly string[]).includes(value);
}

const day = (value: CalendarDate) => assertCalendarDate(value);

/**
 * The dashboards' reads (CM-902, ADR CM-0021 §4): the
 * `construction_reporting` views and functions created by migration
 * `20261016110000_construction_reporting_dashboard_views`, plus the plain
 * rows they need from other contexts (Projects, labour attendance, Team
 * Members). Reporting is a read model: it reads by Company and id, never
 * imports those contexts' code, and never writes to them.
 */
export function prismaDashboardSource(db: PrismaClient): DashboardSource {
  return {
    today(workspaceId) {
      return companyToday(db, workspaceId);
    },

    async projects(workspaceId, ids) {
      if (ids?.length === 0) return [];
      const rows = await db.constructionProjectsProject.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...(ids == null ? {} : { id: { in: [...ids] } }),
        },
        select: { id: true, name: true, status: true },
      });
      return rows.flatMap((row) =>
        isProjectStatus(row.status)
          ? [{ id: row.id, name: row.name, status: row.status }]
          : [],
      );
    },

    async pendingApprovals(workspaceId, projectIds) {
      const out = new Map<string, ApprovalCounts>();
      if (projectIds.length === 0) return out;
      const rows = await db.$queryRaw<
        { projectId: string; module: string; pending: number }[]
      >(Prisma.sql`
        SELECT project_id::text AS "projectId", module, pending
        FROM construction_reporting.project_pending_approvals
        WHERE workspace_id = ${workspaceId}
          AND project_id = ANY(${[...new Set(projectIds)]}::uuid[])`);
      for (const row of rows) {
        if (!isApprovalModule(row.module)) continue;
        const counts = out.get(row.projectId) ?? noApprovals();
        counts[row.module] += row.pending;
        out.set(row.projectId, counts);
      }
      return out;
    },

    async pendingTracking(workspaceId, query) {
      const out = new Map<string, PendingTracking>();
      if (query.projectIds.length === 0) return out;
      const rows = await db.$queryRaw<
        {
          projectId: string;
          pendingIssues: number;
          delayedIssues: number;
          pendingInspections: number;
        }[]
      >(Prisma.sql`
        SELECT project_id::text AS "projectId",
               pending_issues AS "pendingIssues",
               delayed_issues AS "delayedIssues",
               pending_inspections AS "pendingInspections"
        FROM construction_reporting.project_pending_tracking(
          ${workspaceId},
          ${day(query.today)}::date,
          ${day(query.range.from)}::date,
          ${day(query.range.to)}::date,
          ${query.own?.userId ?? null}::text,
          ${query.own?.memberId ?? null}::uuid)
        WHERE project_id = ANY(${[...new Set(query.projectIds)]}::uuid[])`);
      for (const row of rows)
        out.set(row.projectId, {
          pendingIssues: row.pendingIssues,
          delayedIssues: row.delayedIssues,
          pendingInspections: row.pendingInspections,
        });
      return out;
    },

    async payableDuesOn(workspaceId, projectId, asOn) {
      const rows = await db.$queryRaw<
        {
          partyType: string;
          partyId: string;
          invoiced: bigint;
          paid: bigint;
          writtenOff: bigint;
          due: bigint;
          overdue: bigint;
        }[]
      >(Prisma.sql`
        SELECT party_type AS "partyType", party_id::text AS "partyId",
               invoiced, paid, written_off AS "writtenOff", due, overdue
        FROM construction_reporting.party_dues_on(${workspaceId}, ${day(asOn)}::date)
        WHERE direction = 'payable' AND project_id = ${projectId}::uuid`);
      return rows.flatMap((row): DashboardPartyDue[] =>
        isPartyType(row.partyType)
          ? [
              {
                partyType: row.partyType,
                partyId: row.partyId,
                invoiced: row.invoiced,
                paid: row.paid,
                writtenOff: row.writtenOff,
                due: row.due,
                overdue: row.overdue,
              },
            ]
          : [],
      );
    },

    async payableDueToday(workspaceId, projectIds) {
      const out = new Map<string, bigint>();
      if (projectIds.length === 0) return out;
      const rows = await db.$queryRaw<{ projectId: string; due: bigint }[]>(
        Prisma.sql`
          SELECT project_id::text AS "projectId", COALESCE(sum(due), 0)::bigint AS due
          FROM construction_reporting.party_dues
          WHERE workspace_id = ${workspaceId}
            AND direction = 'payable'
            AND project_id = ANY(${[...new Set(projectIds)]}::uuid[])
          GROUP BY 1`,
      );
      for (const row of rows) out.set(row.projectId, row.due);
      return out;
    },

    async labourPresent(workspaceId, projectIds, date) {
      const out = new Map<string, number>();
      if (projectIds.length === 0) return out;
      // "Labours present today" on the Project Dashboard: Present + Half Day.
      const rows = await db.$queryRaw<{ projectId: string; present: number }[]>(
        Prisma.sql`
          SELECT project_id::text AS "projectId", count(*)::int AS present
          FROM construction_labour.labour_attendance
          WHERE workspace_id = ${workspaceId}
            AND project_id = ANY(${[...new Set(projectIds)]}::uuid[])
            AND attendance_date = ${day(date)}::date
            AND status IN ('present', 'half_day')
            AND deleted_at IS NULL
          GROUP BY 1`,
      );
      for (const row of rows) out.set(row.projectId, row.present);
      return out;
    },

    async memberIdOfUser(workspaceId, userId) {
      const row = await db.constructionOrganizationTeamMember.findFirst({
        where: { workspaceId, userId, deletedAt: null },
        select: { id: true },
      });
      return row?.id ?? null;
    },
  };
}
