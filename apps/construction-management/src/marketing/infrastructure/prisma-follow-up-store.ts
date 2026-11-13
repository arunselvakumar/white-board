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

/**
 * A Follow-up whose company is gone is gone too (ADR CM-0040 §11): the
 * company delete tombstones them, and every read checks it again.
 */
const LIVE_COMPANY = { prospectCompany: { deletedAt: null } } as const;

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
    where: { id, workspaceId, deletedAt: null, ...LIVE_COMPANY },
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
      ...LIVE_COMPANY,
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
    const day = calendarDateToDb(date);
    const rows = await prisma.constructionMarketingFollowUp.findMany({
      where: {
        status: "open",
        deletedAt: null,
        ...LIVE_COMPANY,
        // Not every old overdue one again each day: only those not yet
        // told, and those due on `date` not yet told that day.
        OR: [
          { dueDate: { lt: day }, overdueNotifiedAt: null },
          {
            dueDate: day,
            OR: [{ dueNotifiedOn: null }, { dueNotifiedOn: { not: day } }],
          },
        ],
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
        ...LIVE_COMPANY,
        ...followUpVisibleWhere(scope),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SELECT,
    });
    return rows.map(toStored);
  },

  async reassignOpen(db, workspaceId, companyId, toMemberId, by, at) {
    // Locked first: a Done that commits meanwhile is seen here as no
    // longer open, so it is neither moved nor listed in the audit.
    const open = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM construction_marketing.follow_ups
      WHERE workspace_id = ${workspaceId}
        AND prospect_company_id = ${companyId}::uuid
        AND status = 'open'
        AND deleted_at IS NULL
        AND owner_member_id <> ${toMemberId}::uuid
      FOR UPDATE`);
    const ids = open.map((row) => row.id);
    if (ids.length > 0)
      await db.constructionMarketingFollowUp.updateMany({
        where: { id: { in: ids }, status: "open", deletedAt: null },
        data: {
          ownerMemberId: toMemberId,
          dueNotifiedOn: null,
          overdueNotifiedAt: null,
          updatedAt: at,
          updatedBy: by,
        },
      });
    return ids;
  },

  async openCount(db, workspaceId, companyId) {
    return db.constructionMarketingFollowUp.count({
      where: {
        workspaceId,
        prospectCompanyId: companyId,
        status: "open",
        deletedAt: null,
        ...LIVE_COMPANY,
      },
    });
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
        ...LIVE_COMPANY,
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

  async removeForCompany(tx, input) {
    const where = {
      workspaceId: input.workspaceId,
      prospectCompanyId: input.companyId,
      deletedAt: null,
    };
    const rows = await tx.constructionMarketingFollowUp.findMany({
      where,
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    await tx.constructionMarketingFollowUp.updateMany({
      where: { ...where, id: { in: ids } },
      data: tombstone(input.by, input.now),
    });
    return ids;
  },
};
