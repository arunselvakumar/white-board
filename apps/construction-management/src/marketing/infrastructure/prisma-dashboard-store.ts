import { prisma, type Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";

import type { DashboardActivity, DashboardStore } from "../application/ports";
import type { DashboardScope } from "../domain/dashboard";
import type { Stage } from "../domain/marketing-terms";
import { followUpVisibleWhere } from "./prisma-follow-up-store";
import { prospectCompanyVisibleWhere } from "./prisma-prospect-company-store";
import { visitVisibleWhere } from "./prisma-visit-store";

type VisitWhere = Prisma.ConstructionMarketingVisitWhereInput;
type FollowUpWhere = Prisma.ConstructionMarketingFollowUpWhereInput;
type CompanyWhere = Prisma.ConstructionMarketingProspectCompanyWhereInput;

/**
 * The Dashboard's scope as each record's `where` (ADR CM-0040 §13): the
 * own-entries rule of §5 through the same builders every list uses; one
 * person's Visits they went on, Follow-ups they own and companies assigned
 * to them; or every record.
 */
function visitScope(scope: DashboardScope): VisitWhere {
  switch (scope.kind) {
    case "own":
      return visitVisibleWhere(scope);
    case "person":
      return { visitors: { some: { memberId: scope.memberId } } };
    case "team":
      return {};
  }
}

function followUpScope(scope: DashboardScope): FollowUpWhere {
  switch (scope.kind) {
    case "own":
      return followUpVisibleWhere(scope);
    case "person":
      return { ownerMemberId: scope.memberId };
    case "team":
      return {};
  }
}

function companyScope(scope: DashboardScope): CompanyWhere {
  switch (scope.kind) {
    case "own":
      return prospectCompanyVisibleWhere(scope);
    case "person":
      return { assignedMemberId: scope.memberId };
    case "team":
      return {};
  }
}

const COMPANY_REF = { select: { id: true, name: true } } as const;

/** Dashboard figures as a handful of queries, none per row. */
export const prismaDashboardStore: DashboardStore = {
  async visitsBetween(workspaceId, scope, from, to) {
    const rows = await prisma.constructionMarketingVisit.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: { in: ["planned", "completed"] },
        visitAt: { gte: from, lt: to },
        AND: [visitScope(scope)],
      },
      select: { visitAt: true, status: true, checkInAt: true },
    });
    return rows.map((row) => ({
      visitAt: row.visitAt,
      status: row.status,
      checkedIn: row.checkInAt != null,
    }));
  },

  async openFollowUpsDueBy(workspaceId, scope, today) {
    const day = calendarDateToDb(today);
    const rows = await prisma.constructionMarketingFollowUp.groupBy({
      by: ["dueDate"],
      where: {
        workspaceId,
        deletedAt: null,
        status: "open",
        dueDate: { lte: day },
        prospectCompany: { deletedAt: null },
        AND: [followUpScope(scope)],
      },
      _count: { _all: true },
    });
    let dueToday = 0;
    let overdue = 0;
    for (const row of rows)
      if (calendarDateFromDb(row.dueDate) === today)
        dueToday += row._count._all;
      else overdue += row._count._all;
    return { dueToday, overdue };
  },

  async companyFigures(workspaceId, scope, from, to) {
    const live: CompanyWhere = {
      workspaceId,
      deletedAt: null,
      AND: [companyScope(scope)],
    };
    const [created, stages, moves] = await Promise.all([
      prisma.constructionMarketingProspectCompany.count({
        where: { ...live, createdAt: { gte: from, lt: to } },
      }),
      prisma.constructionMarketingProspectCompany.groupBy({
        by: ["stage"],
        where: live,
        _count: { _all: true },
      }),
      // One row per company and Stage: a Lost company moved to Lost again
      // for another reason counts once.
      prisma.constructionMarketingStageChange.groupBy({
        by: ["toStage", "prospectCompanyId"],
        where: {
          workspaceId,
          toStage: { in: ["won", "lost"] },
          changedAt: { gte: from, lt: to },
          prospectCompany: live,
        },
      }),
    ]);
    return {
      created,
      byStage: new Map<Stage, number>(
        stages.map((row) => [row.stage, row._count._all]),
      ),
      won: moves.filter((row) => row.toStage === "won").length,
      lost: moves.filter((row) => row.toStage === "lost").length,
    };
  },

  async ownVisitsBetween(workspaceId, scope, from, to) {
    const rows = await prisma.constructionMarketingVisit.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: { in: ["planned", "completed"] },
        visitAt: { gte: from, lt: to },
        AND: [visitVisibleWhere(scope)],
      },
      orderBy: [{ visitAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        number: true,
        visitAt: true,
        status: true,
        checkInAt: true,
        prospectCompany: COMPANY_REF,
      },
    });
    return rows.map(({ checkInAt, prospectCompany, ...row }) => ({
      ...row,
      checkedIn: checkInAt != null,
      company: prospectCompany,
    }));
  },

  async ownedFollowUpsDue(workspaceId, memberId, date) {
    const rows = await prisma.constructionMarketingFollowUp.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: "open",
        ownerMemberId: memberId,
        dueDate: calendarDateToDb(date),
        prospectCompany: { deletedAt: null },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        dueDate: true,
        prospectCompany: COMPANY_REF,
      },
    });
    return rows.map(({ prospectCompany, dueDate, ...row }) => ({
      ...row,
      dueDate: calendarDateFromDb(dueDate),
      company: prospectCompany,
    }));
  },

  async recentActivity(workspaceId, scope, kinds, limit) {
    const visits = visitScope(scope);
    const [completed, notes, stageChanges, done] = await Promise.all([
      kinds.visits
        ? prisma.constructionMarketingVisit.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              status: "completed",
              completedAt: { not: null },
              AND: [visits],
            },
            orderBy: [{ completedAt: "desc" }, { id: "desc" }],
            take: limit,
            select: {
              id: true,
              number: true,
              completedAt: true,
              completedBy: true,
              prospectCompany: COMPANY_REF,
            },
          })
        : Promise.resolve([]),
      kinds.visits
        ? prisma.constructionMarketingVisitNote.findMany({
            where: {
              workspaceId,
              visit: { deletedAt: null, AND: [visits] },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: limit,
            select: {
              text: true,
              createdAt: true,
              createdBy: true,
              visit: {
                select: {
                  id: true,
                  number: true,
                  prospectCompany: COMPANY_REF,
                },
              },
            },
          })
        : Promise.resolve([]),
      // A company's first row is its creation, not a move.
      kinds.companies
        ? prisma.constructionMarketingStageChange.findMany({
            where: {
              workspaceId,
              fromStage: { not: null },
              prospectCompany: {
                deletedAt: null,
                AND: [companyScope(scope)],
              },
            },
            orderBy: [{ changedAt: "desc" }, { id: "desc" }],
            take: limit,
            select: {
              fromStage: true,
              toStage: true,
              changedAt: true,
              changedBy: true,
              prospectCompany: COMPANY_REF,
            },
          })
        : Promise.resolve([]),
      kinds.followUps
        ? prisma.constructionMarketingFollowUp.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              status: "done",
              doneAt: { not: null },
              prospectCompany: { deletedAt: null },
              AND: [followUpScope(scope)],
            },
            orderBy: [{ doneAt: "desc" }, { id: "desc" }],
            take: limit,
            select: {
              type: true,
              doneAt: true,
              doneBy: true,
              visit: { select: { id: true, number: true } },
              prospectCompany: COMPANY_REF,
            },
          })
        : Promise.resolve([]),
    ]);
    const rows: DashboardActivity[] = [];
    for (const visit of completed)
      if (visit.completedAt != null)
        rows.push({
          kind: "visit_completed",
          at: visit.completedAt,
          byUserId: visit.completedBy,
          company: visit.prospectCompany,
          visit: { id: visit.id, number: visit.number },
        });
    for (const note of notes)
      rows.push({
        kind: "note",
        at: note.createdAt,
        byUserId: note.createdBy,
        company: note.visit.prospectCompany,
        visit: { id: note.visit.id, number: note.visit.number },
        note: note.text,
      });
    for (const change of stageChanges)
      if (change.fromStage != null)
        rows.push({
          kind: "stage_change",
          at: change.changedAt,
          byUserId: change.changedBy,
          company: change.prospectCompany,
          visit: null,
          stage: { from: change.fromStage, to: change.toStage },
        });
    for (const followUp of done)
      if (followUp.doneAt != null)
        rows.push({
          kind: "follow_up_done",
          at: followUp.doneAt,
          byUserId: followUp.doneBy,
          company: followUp.prospectCompany,
          visit: followUp.visit,
          followUpType: followUp.type,
        });
    return rows;
  },

  async hotWithoutFollowUp(workspaceId, scope, limit) {
    // Narrowed in SQL to companies with a Hot Visit and no open Follow-up;
    // whether the Hot one is the latest is checked on the one latest Visit.
    const rows = await prisma.constructionMarketingProspectCompany.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        AND: [companyScope(scope)],
        visits: {
          some: { status: "completed", interest: "hot", deletedAt: null },
        },
        followUps: { none: { status: "open", deletedAt: null } },
      },
      select: {
        id: true,
        name: true,
        assignedMemberId: true,
        visits: {
          where: { status: "completed", deletedAt: null },
          orderBy: [{ visitAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { visitAt: true, interest: true },
        },
      },
    });
    return rows
      .flatMap(({ visits, ...row }) => {
        const last = visits[0];
        return last?.interest === "hot"
          ? [{ ...row, lastVisitAt: last.visitAt }]
          : [];
      })
      .sort(
        (a, b) =>
          b.lastVisitAt.getTime() - a.lastVisitAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, limit);
  },
};
