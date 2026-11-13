import { Prisma } from "@repo/construction-db";

import type { OwnScope } from "@/src/shared-kernel/access";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  CompanyVisitsReader,
  MarketingTx,
  StoredVisit,
  VisitRow,
  VisitStore,
} from "../application/ports";
import type { VisitShownStatus } from "../domain/marketing-terms";

type Where = Prisma.ConstructionMarketingVisitWhereInput;

/**
 * The list `where` of §5's rule (ADR CM-0040): every Visit with View all,
 * else those the caller created or is a visitor on. Every list, count,
 * calendar and figure over Visits goes through it, as `isVisitVisible`
 * does for one record.
 */
export function visitVisibleWhere(scope: OwnScope): Where {
  if (scope == null) return {};
  return {
    OR: [
      { createdBy: scope.userId },
      ...(scope.memberId == null
        ? []
        : [{ visitors: { some: { memberId: scope.memberId } } }]),
    ],
  };
}

function statusWhere(status: VisitShownStatus, now: Date): Where {
  switch (status) {
    case "planned":
      return { status: "planned", visitAt: { gte: now } };
    case "missed":
      return { status: "planned", visitAt: { lt: now } };
    default:
      return { status };
  }
}

/** `YYYY-MM` ↔ the first day of the month, as Postgres keeps a date. */
function monthToDb(month: string | null): Date | null {
  return month == null ? null : new Date(`${month}-01T00:00:00Z`);
}

function monthFromDb(value: Date | null): string | null {
  return value == null ? null : value.toISOString().slice(0, 7);
}

const VISIT_SELECT = {
  id: true,
  workspaceId: true,
  number: true,
  prospectCompanyId: true,
  visitAt: true,
  status: true,
  purpose: true,
  location: true,
  discussion: true,
  outcome: true,
  interest: true,
  requirementWorkType: true,
  requirementValue: true,
  requirementStartMonth: true,
  completedAt: true,
  completedBy: true,
  cancelReason: true,
  cancelledAt: true,
  cancelledBy: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  visitors: { select: { memberId: true }, orderBy: { memberId: "asc" } },
  contacts: { select: { contactId: true } },
} as const satisfies Prisma.ConstructionMarketingVisitSelect;

type VisitRecord = Prisma.ConstructionMarketingVisitGetPayload<{
  select: typeof VISIT_SELECT;
}>;

function toStored(row: VisitRecord): StoredVisit {
  const {
    visitors,
    contacts,
    requirementValue,
    requirementStartMonth,
    ...rest
  } = row;
  return {
    ...rest,
    requirementValue:
      requirementValue == null ? null : Number(requirementValue),
    requirementStartMonth: monthFromDb(requirementStartMonth),
    visitorIds: visitors.map((item) => item.memberId),
    contactIds: contacts.map((item) => item.contactId),
  };
}

function rowData(patch: Partial<VisitRow>) {
  const { requirementValue, requirementStartMonth, ...rest } = patch;
  return {
    ...rest,
    ...(requirementValue === undefined
      ? {}
      : {
          requirementValue:
            requirementValue == null ? null : BigInt(requirementValue),
        }),
    ...(requirementStartMonth === undefined
      ? {}
      : { requirementStartMonth: monthToDb(requirementStartMonth) }),
  };
}

async function find(db: MarketingTx, workspaceId: string, id: string) {
  const row = await db.constructionMarketingVisit.findFirst({
    where: { id, workspaceId, deletedAt: null },
    select: VISIT_SELECT,
  });
  return row == null ? null : toStored(row);
}

async function setLinks(
  db: MarketingTx,
  workspaceId: string,
  visitId: string,
  links: { visitorIds?: readonly string[]; contactIds?: readonly string[] },
) {
  if (links.visitorIds != null) {
    await db.constructionMarketingVisitVisitor.deleteMany({
      where: { visitId },
    });
    await db.constructionMarketingVisitVisitor.createMany({
      data: links.visitorIds.map((memberId) => ({
        workspaceId,
        visitId,
        memberId,
      })),
    });
  }
  if (links.contactIds != null) {
    await db.constructionMarketingVisitContact.deleteMany({
      where: { visitId },
    });
    await db.constructionMarketingVisitContact.createMany({
      data: links.contactIds.map((contactId) => ({
        workspaceId,
        visitId,
        contactId,
      })),
    });
  }
}

export const prismaVisitStore: VisitStore = {
  find,

  async lock(db, workspaceId, id) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_marketing.visits
      WHERE workspace_id = ${workspaceId}
        AND id = ${id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE`);
    return find(db, workspaceId, id);
  },

  async insert(db, row) {
    const {
      id,
      workspaceId,
      number,
      sequence,
      visitorIds,
      contactIds,
      by,
      at,
      ...fields
    } = row;
    await db.constructionMarketingVisit.create({
      data: {
        ...rowData(fields),
        prospectCompanyId: fields.prospectCompanyId,
        visitAt: fields.visitAt,
        id,
        workspaceId,
        number,
        sequence,
        createdAt: at,
        updatedAt: at,
        createdBy: by,
        updatedBy: by,
      },
    });
    await setLinks(db, workspaceId, id, { visitorIds, contactIds });
  },

  async update(db, id, patch, links, by, at) {
    const row = await db.constructionMarketingVisit.update({
      where: { id },
      data: { ...rowData(patch), updatedAt: at, updatedBy: by },
      select: { workspaceId: true },
    });
    await setLinks(db, row.workspaceId, id, links);
  },

  async remove(db, id, by, at) {
    await db.constructionMarketingVisit.update({
      where: { id },
      data: tombstone(by, at),
    });
  },

  async notes(db, workspaceId, visitIds) {
    if (visitIds.length === 0) return [];
    return db.constructionMarketingVisitNote.findMany({
      where: { workspaceId, visitId: { in: [...visitIds] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        visitId: true,
        text: true,
        createdAt: true,
        createdBy: true,
      },
    });
  },

  async addNote(db, row) {
    await db.constructionMarketingVisitNote.create({ data: row });
  },

  async list(db, params) {
    const and: Where[] = [visitVisibleWhere(params.scope)];
    if (params.from != null) and.push({ visitAt: { gte: params.from } });
    if (params.to != null) and.push({ visitAt: { lt: params.to } });
    if (params.memberId != null)
      and.push({ visitors: { some: { memberId: params.memberId } } });
    if (params.prospectCompanyId != null)
      and.push({ prospectCompanyId: params.prospectCompanyId });
    if (params.statuses != null && params.statuses.length > 0)
      and.push({
        OR: params.statuses.map((status) => statusWhere(status, params.now)),
      });
    if (params.purposes != null && params.purposes.length > 0)
      and.push({ purpose: { in: [...params.purposes] } });
    if (params.interests != null && params.interests.length > 0)
      and.push({ interest: { in: [...params.interests] } });
    const where: Where = {
      workspaceId: params.workspaceId,
      deletedAt: null,
      AND: and,
    };
    const after = params.after;
    const [rows, total] = await Promise.all([
      db.constructionMarketingVisit.findMany({
        where:
          after == null
            ? where
            : {
                AND: [
                  where,
                  {
                    OR: [
                      { visitAt: { lt: after.createdAt } },
                      { visitAt: after.createdAt, id: { lt: after.id } },
                    ],
                  },
                ],
              },
        orderBy: [{ visitAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
        select: {
          id: true,
          number: true,
          visitAt: true,
          status: true,
          purpose: true,
          interest: true,
          outcome: true,
          createdBy: true,
          prospectCompany: {
            select: {
              id: true,
              name: true,
              createdBy: true,
              assignedMemberId: true,
            },
          },
          visitors: {
            select: { memberId: true },
            orderBy: { memberId: "asc" },
          },
          contacts: { select: { contact: { select: { name: true } } } },
        },
      }),
      db.constructionMarketingVisit.count({ where }),
    ]);
    return {
      items: rows
        .slice(0, params.limit)
        .map(({ visitors, contacts, ...row }) => ({
          ...row,
          visitorIds: visitors.map((item) => item.memberId),
          contactNames: contacts.map((item) => item.contact.name),
        })),
      hasMore: rows.length > params.limit,
      total,
    };
  },
};

export const prismaCompanyVisitsReader: CompanyVisitsReader = {
  async timeline(db, workspaceId, companyId, scope) {
    const visits = await db.constructionMarketingVisit.findMany({
      where: {
        workspaceId,
        prospectCompanyId: companyId,
        deletedAt: null,
        ...visitVisibleWhere(scope),
      },
      orderBy: [{ visitAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        number: true,
        visitAt: true,
        status: true,
        purpose: true,
        outcome: true,
        visitors: { select: { memberId: true }, orderBy: { memberId: "asc" } },
      },
    });
    const ids = visits.map((visit) => visit.id);
    const [notes, files] = await Promise.all([
      prismaVisitStore.notes(db, workspaceId, ids),
      ids.length === 0
        ? Promise.resolve([])
        : db.constructionMarketingVisitFile.findMany({
            where: { workspaceId, visitId: { in: ids }, deletedAt: null },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              visitId: true,
              fileName: true,
              caption: true,
              createdAt: true,
              createdBy: true,
            },
          }),
    ]);
    return {
      visits: visits.map(({ visitors, ...visit }) => ({
        ...visit,
        visitorIds: visitors.map((item) => item.memberId),
      })),
      notes,
      files,
    };
  },

  async lastVisits(db, workspaceId, companyIds, scope) {
    if (companyIds.length === 0) return new Map();
    const rows = await db.constructionMarketingVisit.groupBy({
      by: ["prospectCompanyId"],
      where: {
        workspaceId,
        prospectCompanyId: { in: [...companyIds] },
        status: "completed",
        deletedAt: null,
        ...visitVisibleWhere(scope),
      },
      _max: { visitAt: true },
    });
    const last = new Map<string, Date>();
    for (const row of rows)
      if (row._max.visitAt != null)
        last.set(row.prospectCompanyId, row._max.visitAt);
    return last;
  },

  liveCount(db, workspaceId, companyId) {
    return db.constructionMarketingVisit.count({
      where: { workspaceId, prospectCompanyId: companyId, deletedAt: null },
    });
  },
};
