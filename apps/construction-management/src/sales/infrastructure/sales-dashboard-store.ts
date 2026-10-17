import type { Prisma, PrismaClient } from "@repo/construction-db";

import type {
  InquiryDashboardFigures,
  InquiryDashboardQuery,
  InquiryDashboardStore,
} from "../application/sales-dashboard";
import type { SalesDirectory } from "../application/ports";
import {
  FOLLOW_UP_ACTIVITIES,
  type FollowUpActivity,
} from "../domain/sales-terms";
import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";

import { inquiryDueWhere, inquiryVisibilityWhere } from "./inquiry-store";

type Where = Prisma.ConstructionSalesInquiryWhereInput;

const NO_SOURCE = "No lead source";
const NO_ASSIGNEE = "Not assigned";

/**
 * The Inquiry section's figures (CM-1008) from `construction_sales`, with
 * the Inquiries list's own `where` pieces (View all, Overdue) so the
 * dashboard and the list always agree.
 */
export class PrismaInquiryDashboardStore implements InquiryDashboardStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: SalesDirectory,
  ) {}

  async read(query: InquiryDashboardQuery): Promise<InquiryDashboardFigures> {
    const { db } = this;
    const base: Where = {
      workspaceId: query.workspaceId,
      projectId: query.projectId,
      deletedAt: null,
      AND: [inquiryVisibilityWhere(query.visibility)],
    };
    const inDuration: Where = {
      ...base,
      inquiryDate: {
        gte: calendarDateToDb(query.range.from),
        lte: calendarDateToDb(query.range.to),
      },
    };
    const followUpsOf = (doneAt: Prisma.DateTimeFilter | undefined) => ({
      workspaceId: query.workspaceId,
      projectId: query.projectId,
      deletedAt: null,
      ...(doneAt == null ? {} : { doneAt }),
      inquiry: { is: base },
    });
    const callRange: Prisma.DateTimeFilter | undefined =
      query.calls.from == null && query.calls.to == null
        ? undefined
        : {
            ...(query.calls.from == null ? {} : { gte: query.calls.from }),
            ...(query.calls.to == null ? {} : { lt: query.calls.to }),
          };
    const [
      byStatus,
      open,
      overdue,
      openByStage,
      stages,
      bySource,
      byAssignee,
      followUpsByMember,
      byActivity,
    ] = await Promise.all([
      db.constructionSalesInquiry.groupBy({
        by: ["status"],
        where: inDuration,
        _count: { _all: true },
      }),
      db.constructionSalesInquiry.count({ where: { ...base, status: "open" } }),
      db.constructionSalesInquiry.count({
        where: {
          ...base,
          AND: [
            ...(base.AND as Where[]),
            inquiryDueWhere("overdue", query.bounds),
          ],
        },
      }),
      db.constructionSalesInquiry.groupBy({
        by: ["funnelStageId"],
        where: { ...base, status: "open" },
        _count: { _all: true },
      }),
      db.constructionSalesFunnelStage.findMany({
        where: {
          workspaceId: query.workspaceId,
          projectId: query.projectId,
          deletedAt: null,
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      db.constructionSalesInquiry.groupBy({
        by: ["leadSourceId", "status"],
        where: inDuration,
        _count: { _all: true },
      }),
      db.constructionSalesInquiry.groupBy({
        by: ["assigneeMemberId", "status"],
        where: inDuration,
        _count: { _all: true },
      }),
      db.constructionSalesFollowUp.groupBy({
        by: ["memberId"],
        where: followUpsOf({
          gte: query.rangeInstants.from,
          lt: query.rangeInstants.to,
        }),
        _count: { _all: true },
      }),
      db.constructionSalesFollowUp.groupBy({
        by: ["activity"],
        where: followUpsOf(callRange),
        _count: { _all: true },
      }),
    ]);
    const statusCount = (status: string) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    const stageCounts = new Map(
      openByStage.map((row) => [row.funnelStageId, row._count._all]),
    );

    const sourceIds = [
      ...new Set(
        bySource.flatMap((row) =>
          row.leadSourceId == null ? [] : [row.leadSourceId],
        ),
      ),
    ];
    const sourceNames = new Map(
      (
        await db.constructionSalesLeadSource.findMany({
          where: { workspaceId: query.workspaceId, id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      ).map((row) => [row.id, row.name]),
    );
    const sources = new Map<
      string | null,
      { total: number; converted: number }
    >();
    for (const row of bySource) {
      const entry = sources.get(row.leadSourceId) ?? { total: 0, converted: 0 };
      entry.total += row._count._all;
      if (row.status === "converted") entry.converted += row._count._all;
      sources.set(row.leadSourceId, entry);
    }

    const team = new Map<
      string | null,
      { inquiries: number; followUps: number; conversions: number }
    >();
    const teamOf = (memberId: string | null) => {
      const found = team.get(memberId) ?? {
        inquiries: 0,
        followUps: 0,
        conversions: 0,
      };
      team.set(memberId, found);
      return found;
    };
    for (const row of byAssignee) {
      const entry = teamOf(row.assigneeMemberId);
      entry.inquiries += row._count._all;
      if (row.status === "converted") entry.conversions += row._count._all;
    }
    // Follow-ups by who did them; one entered without a Team Member is left out.
    for (const row of followUpsByMember)
      if (row.memberId != null)
        teamOf(row.memberId).followUps += row._count._all;
    const members = await this.directory.members(
      db,
      query.workspaceId,
      query.projectId,
      [...team.keys()].filter((id): id is string => id != null),
    );

    const activities = Object.fromEntries(
      FOLLOW_UP_ACTIVITIES.map((activity) => [activity, 0]),
    ) as Record<FollowUpActivity, number>;
    for (const row of byActivity) activities[row.activity] = row._count._all;

    const byName = (a: { name: string }, b: { name: string }) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    return {
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      converted: statusCount("converted"),
      lost: statusCount("lost"),
      open,
      overdue,
      funnel: stages.map((stage) => ({
        stageId: stage.id,
        name: stage.name,
        count: stageCounts.get(stage.id) ?? 0,
      })),
      leadSources: [...sources.entries()]
        .map(([leadSourceId, entry]) => ({
          leadSourceId,
          name:
            leadSourceId == null
              ? NO_SOURCE
              : (sourceNames.get(leadSourceId) ?? "A removed source"),
          ...entry,
        }))
        .sort((a, b) => b.total - a.total || byName(a, b)),
      team: [...team.entries()]
        .map(([memberId, entry]) => ({
          memberId,
          name:
            memberId == null
              ? NO_ASSIGNEE
              : (members.get(memberId)?.name ?? "A former member"),
          ...entry,
        }))
        .sort((a, b) => b.inquiries - a.inquiries || byName(a, b)),
      activities,
    };
  }
}
