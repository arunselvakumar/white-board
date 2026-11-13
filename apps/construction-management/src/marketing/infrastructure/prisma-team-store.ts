import { Prisma, prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";

import type { TeamStore } from "../application/ports";
import { followUpVisibleWhere } from "./prisma-follow-up-store";
import { prospectCompanyVisibleWhere } from "./prisma-prospect-company-store";

/** Team figures and targets over the marketing tables (ADR CM-0040 §4). */
export const prismaTeamStore: TeamStore = {
  async targets(workspaceId, memberIds) {
    if (memberIds.length === 0) return [];
    const rows = await prisma.constructionMarketingVisitTarget.findMany({
      where: { workspaceId, memberId: { in: [...memberIds] } },
      orderBy: { effectiveMonth: "asc" },
      select: { memberId: true, effectiveMonth: true, target: true },
    });
    return rows.map((row) => ({
      memberId: row.memberId,
      effectiveMonth: calendarDateFromDb(row.effectiveMonth).slice(0, 7),
      target: row.target,
    }));
  },

  async setTarget(tx, input) {
    const effectiveMonth = calendarDateToDb(`${input.month}-01`);
    await tx.constructionMarketingVisitTarget.upsert({
      where: {
        workspaceId_memberId_effectiveMonth: {
          workspaceId: input.workspaceId,
          memberId: input.memberId,
          effectiveMonth,
        },
      },
      create: {
        id: newId(),
        workspaceId: input.workspaceId,
        memberId: input.memberId,
        effectiveMonth,
        target: input.target,
        createdAt: input.at,
        updatedAt: input.at,
        createdBy: input.by,
        updatedBy: input.by,
      },
      update: {
        target: input.target,
        updatedAt: input.at,
        updatedBy: input.by,
      },
    });
  },

  async completedVisits(workspaceId, from, to) {
    const rows = await prisma.$queryRaw<{ memberId: string; count: bigint }[]>(
      Prisma.sql`
        SELECT vv.member_id AS "memberId", count(*) AS count
        FROM construction_marketing.visit_visitors vv
        JOIN construction_marketing.visits v ON v.id = vv.visit_id
        WHERE v.workspace_id = ${workspaceId}
          AND v.deleted_at IS NULL
          AND v.status = 'completed'
          AND v.visit_at >= ${from}
          AND v.visit_at < ${to}
        GROUP BY vv.member_id`,
    );
    return new Map(rows.map((row) => [row.memberId, Number(row.count)]));
  },

  async lastVisits(workspaceId) {
    const rows = await prisma.$queryRaw<{ memberId: string; last: Date }[]>(
      Prisma.sql`
        SELECT vv.member_id AS "memberId", max(v.visit_at) AS last
        FROM construction_marketing.visit_visitors vv
        JOIN construction_marketing.visits v ON v.id = vv.visit_id
        WHERE v.workspace_id = ${workspaceId}
          AND v.deleted_at IS NULL
          AND v.status = 'completed'
        GROUP BY vv.member_id`,
    );
    return new Map(rows.map((row) => [row.memberId, row.last]));
  },

  async overdueFollowUps(workspaceId, today) {
    const rows = await prisma.constructionMarketingFollowUp.groupBy({
      by: ["ownerMemberId"],
      where: {
        workspaceId,
        deletedAt: null,
        status: "open",
        dueDate: { lt: calendarDateToDb(today) },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.ownerMemberId, row._count._all]));
  },

  async companiesOutside(workspaceId, active, scope) {
    const rows = await prisma.constructionMarketingProspectCompany.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        assignedMemberId: { not: null, notIn: [...active] },
        ...prospectCompanyVisibleWhere(scope),
      },
      orderBy: [{ nameKey: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        city: true,
        stage: true,
        assignedMemberId: true,
        updatedAt: true,
        // What Reassign moves with it: every open Follow-up, whoever owns it.
        _count: {
          select: {
            followUps: { where: { status: "open", deletedAt: null } },
          },
        },
      },
    });
    return rows.flatMap(({ _count, ...row }) =>
      row.assignedMemberId == null
        ? []
        : [
            {
              ...row,
              assignedMemberId: row.assignedMemberId,
              openFollowUps: _count.followUps,
            },
          ],
    );
  },

  async followUpsOutside(workspaceId, active, scope) {
    const rows = await prisma.constructionMarketingFollowUp.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: "open",
        ownerMemberId: { notIn: [...active] },
        prospectCompany: { deletedAt: null },
        ...followUpVisibleWhere(scope),
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        dueDate: true,
        ownerMemberId: true,
        updatedAt: true,
        prospectCompany: { select: { id: true, name: true } },
      },
    });
    return rows.map((row) => ({
      ...row,
      dueDate: calendarDateFromDb(row.dueDate),
    }));
  },
};
