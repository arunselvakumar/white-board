import { Prisma, prisma } from "@repo/construction-db";

import type { OwnScope } from "@/src/shared-kernel/access";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  CompanyFollowUpsReader,
  FollowUpRow,
  FollowUpStore,
  MarketingTx,
  StoredFollowUp,
} from "../application/ports";

type Where = Prisma.ConstructionMarketingFollowUpWhereInput;

/**
 * The list `where` of §5's rule (ADR CM-0040): every Follow-up with View
 * all, else those the caller created or owns. Every list, count and
 * figure over Follow-ups goes through it, as `isFollowUpVisible` does for
 * one record.
 */
export function followUpVisibleWhere(scope: OwnScope): Where {
  if (scope == null) return {};
  return {
    OR: [
      { createdBy: scope.userId },
      ...(scope.memberId == null ? [] : [{ ownerMemberId: scope.memberId }]),
    ],
  };
}

const SELECT = {
  id: true,
  workspaceId: true,
  prospectCompanyId: true,
  visitId: true,
  type: true,
  dueDate: true,
  ownerMemberId: true,
  note: true,
  status: true,
  resultNote: true,
  doneOn: true,
  doneAt: true,
  doneBy: true,
  cancelledAt: true,
  cancelledBy: true,
  dueNotifiedOn: true,
  overdueNotifiedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
} as const satisfies Prisma.ConstructionMarketingFollowUpSelect;

type FollowUpRecord = Prisma.ConstructionMarketingFollowUpGetPayload<{
  select: typeof SELECT;
}>;

function toStored(row: FollowUpRecord): StoredFollowUp {
  return {
    ...row,
    dueDate: calendarDateFromDb(row.dueDate),
    doneOn: row.doneOn == null ? null : calendarDateFromDb(row.doneOn),
    dueNotifiedOn:
      row.dueNotifiedOn == null ? null : calendarDateFromDb(row.dueNotifiedOn),
  };
}

function toData(patch: Partial<FollowUpRow>) {
  const { dueDate, doneOn, dueNotifiedOn, ...rest } = patch;
  return {
    ...rest,
    ...(dueDate === undefined ? {} : { dueDate: calendarDateToDb(dueDate) }),
    ...(doneOn === undefined
      ? {}
      : { doneOn: doneOn == null ? null : calendarDateToDb(doneOn) }),
    ...(dueNotifiedOn === undefined
      ? {}
      : {
          dueNotifiedOn:
            dueNotifiedOn == null ? null : calendarDateToDb(dueNotifiedOn),
        }),
  };
}

async function find(db: MarketingTx, workspaceId: string, id: string) {
  const row = await db.constructionMarketingFollowUp.findFirst({
    where: { id, workspaceId, deletedAt: null },
    select: SELECT,
  });
  return row == null ? null : toStored(row);
}

export const prismaFollowUpStore: FollowUpStore = {
  find,

  async lock(db, workspaceId, id) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_marketing.follow_ups
      WHERE workspace_id = ${workspaceId}
        AND id = ${id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE`);
    return find(db, workspaceId, id);
  },

  async insert(db, row) {
    const { id, workspaceId, by, at, ...fields } = row;
    await db.constructionMarketingFollowUp.create({
      data: {
        ...toData(fields),
        prospectCompanyId: fields.prospectCompanyId,
        type: fields.type,
        dueDate: calendarDateToDb(fields.dueDate),
        ownerMemberId: fields.ownerMemberId,
        id,
        workspaceId,
        createdAt: at,
        updatedAt: at,
        createdBy: by,
        updatedBy: by,
      },
    });
  },

  async update(db, id, patch, by, at) {
    await db.constructionMarketingFollowUp.update({
      where: { id },
      data: { ...toData(patch), updatedAt: at, updatedBy: by },
    });
  },

  async remove(db, id, by, at) {
    await db.constructionMarketingFollowUp.update({
      where: { id },
      data: tombstone(by, at),
    });
  },

  async list(db, params) {
    const and: Where[] = [followUpVisibleWhere(params.scope)];
    if (params.ownerMemberId != null)
      and.push({ ownerMemberId: params.ownerMemberId });
    if (params.statuses != null && params.statuses.length > 0)
      and.push({ status: { in: [...params.statuses] } });
    if (params.prospectCompanyId != null)
      and.push({ prospectCompanyId: params.prospectCompanyId });
    if (params.visitId != null) and.push({ visitId: params.visitId });
    const where: Where = {
      workspaceId: params.workspaceId,
      deletedAt: null,
      AND: and,
    };
    const after = params.after;
    const afterDate = after == null ? null : calendarDateToDb(after.dueDate);
    const [rows, total] = await Promise.all([
      db.constructionMarketingFollowUp.findMany({
        where:
          after == null || afterDate == null
            ? where
            : {
                AND: [
                  where,
                  {
                    OR: [
                      { dueDate: { gt: afterDate } },
                      { dueDate: afterDate, id: { gt: after.id } },
                    ],
                  },
                ],
              },
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        take: params.limit + 1,
        select: {
          ...SELECT,
          prospectCompany: {
            select: {
              id: true,
              name: true,
              createdBy: true,
              assignedMemberId: true,
            },
          },
          visit: { select: { id: true, number: true } },
        },
      }),
      db.constructionMarketingFollowUp.count({ where }),
    ]);
    return {
      items: rows
        .slice(0, params.limit)
        .map(({ prospectCompany, visit, ...row }) => ({
          ...toStored(row),
          prospectCompany,
          visit,
        })),
      hasMore: rows.length > params.limit,
      total,
    };
  },

  async markReminded(id, mark) {
    await prisma.constructionMarketingFollowUp.update({
      where: { id },
      data:
        "dueNotifiedOn" in mark
          ? { dueNotifiedOn: calendarDateToDb(mark.dueNotifiedOn) }
          : { overdueNotifiedAt: mark.overdueNotifiedAt },
    });
  },

  async openDueBy(date, page) {
    const rows = await prisma.constructionMarketingFollowUp.findMany({
      where: {
        status: "open",
        deletedAt: null,
        dueDate: { lte: calendarDateToDb(date) },
      },
      orderBy: { id: "asc" },
      take: page.limit,
      ...(page.after == null ? {} : { cursor: { id: page.after }, skip: 1 }),
      select: SELECT,
    });
    return rows.map(toStored);
  },
};

export const prismaCompanyFollowUpsReader: CompanyFollowUpsReader = {
  async forCompany(db, workspaceId, companyId, scope) {
    const rows = await db.constructionMarketingFollowUp.findMany({
      where: {
        workspaceId,
        prospectCompanyId: companyId,
        deletedAt: null,
        ...followUpVisibleWhere(scope),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SELECT,
    });
    return rows.map(toStored);
  },

  async nextDue(db, workspaceId, companyIds, scope) {
    if (companyIds.length === 0) return new Map();
    const rows = await db.constructionMarketingFollowUp.groupBy({
      by: ["prospectCompanyId"],
      where: {
        workspaceId,
        prospectCompanyId: { in: [...companyIds] },
        status: "open",
        deletedAt: null,
        ...followUpVisibleWhere(scope),
      },
      _min: { dueDate: true },
    });
    const next = new Map<string, string>();
    for (const row of rows)
      if (row._min.dueDate != null)
        next.set(row.prospectCompanyId, calendarDateFromDb(row._min.dueDate));
    return next;
  },
};
