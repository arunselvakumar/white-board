import { Prisma } from "@repo/construction-db";

import type { OwnScope } from "@/src/shared-kernel/access";
import { newId } from "@/src/shared-kernel/ids";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  ProspectCompanyListParams,
  ProspectCompanyStore,
  StoredContact,
} from "../application/ports";
import { prospectCompanyNameKey } from "../domain/prospect-company";

type Where = Prisma.ConstructionMarketingProspectCompanyWhereInput;

/**
 * The list `where` of §5's rule (ADR CM-0040): every company with View
 * all, else those the caller created or is assigned. Every list, count and
 * figure over companies goes through it, as `isProspectCompanyVisible`
 * does for one record.
 */
export function prospectCompanyVisibleWhere(scope: OwnScope): Where {
  if (scope == null) return {};
  return {
    OR: [
      { createdBy: scope.userId },
      ...(scope.memberId == null ? [] : [{ assignedMemberId: scope.memberId }]),
    ],
  };
}

const COMPANY_SELECT = {
  id: true,
  workspaceId: true,
  name: true,
  industry: true,
  address: true,
  city: true,
  stateCode: true,
  pin: true,
  phone: true,
  email: true,
  website: true,
  gstin: true,
  source: true,
  assignedMemberId: true,
  stage: true,
  lostReason: true,
  lostReasonText: true,
  remarks: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} as const satisfies Prisma.ConstructionMarketingProspectCompanySelect;

const CONTACT_SELECT = {
  id: true,
  prospectCompanyId: true,
  name: true,
  jobTitle: true,
  mobile: true,
  email: true,
  remarks: true,
  isPrimary: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ConstructionMarketingContactSelect;

/** Parts of a search that match a Contact's stored `+91…` mobile. */
function mobileDigits(search: string): string | null {
  const digits = search.replace(/\D/g, "");
  return digits.length >= 3 ? digits : null;
}

function listWhere(params: ProspectCompanyListParams): Where {
  const and: Where[] = [prospectCompanyVisibleWhere(params.scope)];
  const search = params.search?.trim();
  if (search != null && search !== "") {
    const digits = mobileDigits(search);
    const contains = { contains: search, mode: "insensitive" } as const;
    and.push({
      OR: [
        { name: contains },
        { city: contains },
        {
          contacts: {
            some: {
              deletedAt: null,
              OR: [
                { name: contains },
                ...(digits == null ? [] : [{ mobile: { contains: digits } }]),
              ],
            },
          },
        },
      ],
    });
  }
  if (params.stages != null && params.stages.length > 0)
    and.push({ stage: { in: [...params.stages] } });
  if (params.assignedMemberId != null)
    and.push({ assignedMemberId: params.assignedMemberId });
  if (params.industry != null && params.industry.trim() !== "")
    and.push({
      industry: { equals: params.industry.trim(), mode: "insensitive" },
    });
  return { workspaceId: params.workspaceId, deletedAt: null, AND: and };
}

export const prismaProspectCompanyStore: ProspectCompanyStore = {
  async find(db, workspaceId, id) {
    return db.constructionMarketingProspectCompany.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: COMPANY_SELECT,
    });
  },

  async lock(db, workspaceId, id) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_marketing.prospect_companies
      WHERE workspace_id = ${workspaceId}
        AND id = ${id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE`);
    return this.find(db, workspaceId, id);
  },

  async nameTaken(db, workspaceId, nameKey, exceptId) {
    const row = await db.constructionMarketingProspectCompany.findFirst({
      where: {
        workspaceId,
        nameKey,
        deletedAt: null,
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    return row != null;
  },

  async insert(db, row) {
    const { id, workspaceId, assignedMemberId, by, at, ...details } = row;
    await db.constructionMarketingProspectCompany.create({
      data: {
        ...details,
        id,
        workspaceId,
        nameKey: prospectCompanyNameKey(details.name),
        assignedMemberId,
        createdAt: at,
        updatedAt: at,
        createdBy: by,
        updatedBy: by,
      },
    });
  },

  async update(db, id, details, by, at) {
    await db.constructionMarketingProspectCompany.update({
      where: { id },
      data: {
        ...details,
        nameKey: prospectCompanyNameKey(details.name),
        updatedAt: at,
        updatedBy: by,
      },
    });
  },

  async assign(db, id, memberId, by, at) {
    await db.constructionMarketingProspectCompany.update({
      where: { id },
      data: { assignedMemberId: memberId, updatedAt: at, updatedBy: by },
    });
  },

  async setStage(db, id, move, by, at) {
    await db.constructionMarketingProspectCompany.update({
      where: { id },
      data: {
        stage: move.stage,
        lostReason: move.lostReason,
        lostReasonText: move.lostReasonText,
        updatedAt: at,
        updatedBy: by,
      },
    });
  },

  async remove(db, id, by, at) {
    await db.constructionMarketingContact.updateMany({
      where: { prospectCompanyId: id, deletedAt: null },
      data: tombstone(by, at),
    });
    await db.constructionMarketingProspectCompany.update({
      where: { id },
      data: tombstone(by, at),
    });
  },

  async appendStageChange(db, row) {
    await db.constructionMarketingStageChange.create({
      data: {
        id: newId(),
        workspaceId: row.workspaceId,
        prospectCompanyId: row.prospectCompanyId,
        fromStage: row.fromStage,
        toStage: row.move.stage,
        lostReason: row.move.lostReason,
        lostReasonText: row.move.lostReasonText,
        changedAt: row.at,
        changedBy: row.by,
      },
    });
  },

  async stageChanges(db, workspaceId, id) {
    return db.constructionMarketingStageChange.findMany({
      where: { workspaceId, prospectCompanyId: id },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        fromStage: true,
        toStage: true,
        lostReason: true,
        lostReasonText: true,
        changedAt: true,
        changedBy: true,
      },
    });
  },

  async list(db, params) {
    const where = listWhere(params);
    const after = params.after;
    const [rows, total] = await Promise.all([
      db.constructionMarketingProspectCompany.findMany({
        where:
          after == null
            ? where
            : {
                AND: [
                  where,
                  {
                    OR: [
                      { nameKey: { gt: after.name } },
                      { nameKey: after.name, id: { gt: after.id } },
                    ],
                  },
                ],
              },
        orderBy: [{ nameKey: "asc" }, { id: "asc" }],
        take: params.limit + 1,
        select: {
          id: true,
          name: true,
          nameKey: true,
          industry: true,
          city: true,
          stateCode: true,
          stage: true,
          assignedMemberId: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          contacts: {
            where: { deletedAt: null, isPrimary: true },
            select: { name: true, mobile: true },
            take: 1,
          },
        },
      }),
      db.constructionMarketingProspectCompany.count({ where }),
    ]);
    const hasMore = rows.length > params.limit;
    return {
      items: rows.slice(0, params.limit).map(({ contacts, ...row }) => ({
        ...row,
        primaryContact: contacts[0] ?? null,
      })),
      hasMore,
      total,
    };
  },

  pickable(db, workspaceId, scope) {
    return db.constructionMarketingProspectCompany.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...prospectCompanyVisibleWhere(scope),
      },
      orderBy: [{ nameKey: "asc" }, { id: "asc" }],
      select: { id: true, name: true, address: true, city: true },
    });
  },

  async industries(db, workspaceId, scope) {
    const rows = await db.constructionMarketingProspectCompany.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        industry: { not: null },
        ...prospectCompanyVisibleWhere(scope),
      },
      distinct: ["industry"],
      select: { industry: true },
    });
    const byKey = new Map<string, string>();
    for (const { industry } of rows)
      if (industry != null && !byKey.has(industry.toLowerCase()))
        byKey.set(industry.toLowerCase(), industry);
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  },

  async contacts(db, workspaceId, prospectCompanyId) {
    const rows: StoredContact[] =
      await db.constructionMarketingContact.findMany({
        where: { workspaceId, prospectCompanyId, deletedAt: null },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
        select: CONTACT_SELECT,
      });
    return rows;
  },

  async insertContact(db, row) {
    const {
      id,
      workspaceId,
      prospectCompanyId,
      isPrimary,
      by,
      at,
      ...details
    } = row;
    await db.constructionMarketingContact.create({
      data: {
        ...details,
        id,
        workspaceId,
        prospectCompanyId,
        isPrimary,
        createdAt: at,
        updatedAt: at,
        createdBy: by,
        updatedBy: by,
      },
    });
  },

  async updateContact(db, id, details, by, at) {
    await db.constructionMarketingContact.update({
      where: { id },
      data: { ...details, updatedAt: at, updatedBy: by },
    });
  },

  async makePrimary(db, prospectCompanyId, contactId, by, at) {
    await db.constructionMarketingContact.updateMany({
      where: {
        prospectCompanyId,
        isPrimary: true,
        deletedAt: null,
        id: { not: contactId },
      },
      data: { isPrimary: false, updatedAt: at, updatedBy: by },
    });
    await db.constructionMarketingContact.update({
      where: { id: contactId },
      data: { isPrimary: true, updatedAt: at, updatedBy: by },
    });
  },

  async contactsByIds(db, workspaceId, ids) {
    if (ids.length === 0) return [];
    return db.constructionMarketingContact.findMany({
      where: { workspaceId, id: { in: [...ids] } },
      select: CONTACT_SELECT,
    });
  },

  async removeContact(db, id, by, at) {
    await db.constructionMarketingContact.update({
      where: { id },
      data: { ...tombstone(by, at), isPrimary: false },
    });
  },
};
