import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import {
  OtherPartyHandlers,
  otherPartyChanged,
  otherPartyInUse,
  otherPartyNameTaken,
  otherPartyNotFound,
  type OtherPartyListParams,
  type OtherPartyStore,
  type StoredOtherParty,
} from "../application/other-party-handlers";
import type { FinanceDirectory } from "../application/ports";

type Tx = Prisma.TransactionClient;

const include = { projects: { select: { projectId: true } } } as const;

type Row = Prisma.ConstructionFinanceOtherPartyGetPayload<{
  include: typeof include;
}>;

function toStored(row: Row): StoredOtherParty {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    gstin: row.gstin,
    pan: row.pan,
    stateCode: row.stateCode,
    address: row.address,
    projectIds: row.projects.map((item) => item.projectId).sort(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function snapshot(party: StoredOtherParty) {
  return {
    name: party.name,
    mobile: party.mobile,
    email: party.email,
    gstin: party.gstin,
    pan: party.pan,
    stateCode: party.stateCode,
    address: party.address,
    projectIds: party.projectIds,
  };
}

/** The live Other Party with this name (any case), other than `exceptId`. */
async function nameTaken(
  tx: Tx,
  workspaceId: string,
  name: string,
  exceptId: string | null,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id::text AS id FROM construction_finance.other_parties
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        AND lower(name) = lower(${name})
        AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)
      LIMIT 1`,
  );
  return rows.length > 0;
}

/**
 * Other Parties in `construction_finance.other_parties` (CM-704). Project
 * names come through the `FinanceDirectory` port.
 */
export class PrismaOtherPartyStore implements OtherPartyStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly directory: Pick<FinanceDirectory, "projects">,
  ) {}

  async find(workspaceId: string, id: string) {
    const row = await this.db.constructionFinanceOtherParty.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include,
    });
    return row == null ? null : toStored(row);
  }

  async list(params: OtherPartyListParams) {
    const filters: Prisma.ConstructionFinanceOtherPartyWhereInput[] = [
      { workspaceId: params.workspaceId, deletedAt: null },
    ];
    const search = params.search?.trim() ?? "";
    if (search !== "") {
      const contains = { contains: search, mode: "insensitive" as const };
      const digits = search.replace(/\D/g, "");
      filters.push({
        OR: [
          { name: contains },
          { email: contains },
          { gstin: contains },
          ...(digits.length >= 3 ? [{ mobile: { contains: digits } }] : []),
        ],
      });
    }
    if (params.projectId != null)
      filters.push({ projects: { some: { projectId: params.projectId } } });
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const where: Prisma.ConstructionFinanceOtherPartyWhereInput = {
      AND:
        cursor == null
          ? filters
          : [
              ...filters,
              {
                OR: backwards
                  ? [
                      { createdAt: { gt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                    ]
                  : [
                      { createdAt: { lt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                    ],
              },
            ],
    };
    const [page, total] = await Promise.all([
      this.db.constructionFinanceOtherParty.findMany({
        where,
        include,
        orderBy: backwards
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      this.db.constructionFinanceOtherParty.count({ where: { AND: filters } }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return { items: rows.map(toStored), total, hasMore };
  }

  async projectNames(workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return new Map<string, string>();
    const projects = await this.directory.projects(this.db, workspaceId, [
      ...new Set(ids),
    ]);
    return new Map(
      [...projects.values()].map((project) => [project.id, project.name]),
    );
  }

  async insert(party: StoredOtherParty): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        if (await nameTaken(tx, party.workspaceId, party.name, null))
          throw otherPartyNameTaken(party.name);
        await tx.constructionFinanceOtherParty.create({
          data: {
            id: party.id,
            workspaceId: party.workspaceId,
            name: party.name,
            mobile: party.mobile,
            email: party.email,
            gstin: party.gstin,
            pan: party.pan,
            stateCode: party.stateCode,
            address: party.address,
            createdAt: party.createdAt,
            updatedAt: party.updatedAt,
            createdBy: party.createdBy,
            updatedBy: party.updatedBy,
            projects: {
              create: party.projectIds.map((projectId) => ({ projectId })),
            },
          },
        });
        await recordAudit(tx, {
          workspaceId: party.workspaceId,
          actorUserId: party.createdBy,
          action: "other_party.created",
          entityType: "other_party",
          entityId: party.id,
          after: snapshot(party),
          occurredAt: party.createdAt,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw otherPartyNameTaken(party.name);
      throw error;
    }
  }

  async update(input: Parameters<OtherPartyStore["update"]>[0]) {
    const { before, after } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const updated = await tx.constructionFinanceOtherParty.updateMany({
          where: {
            id: before.id,
            workspaceId: before.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: {
            name: after.name,
            mobile: after.mobile,
            email: after.email,
            gstin: after.gstin,
            pan: after.pan,
            stateCode: after.stateCode,
            address: after.address,
            updatedAt: after.updatedAt,
            updatedBy: after.updatedBy,
          },
        });
        if (updated.count === 0) {
          const live = await tx.constructionFinanceOtherParty.count({
            where: { id: before.id, deletedAt: null },
          });
          throw live === 0 ? otherPartyNotFound() : otherPartyChanged();
        }
        if (await nameTaken(tx, before.workspaceId, after.name, before.id))
          throw otherPartyNameTaken(after.name);
        await tx.constructionFinanceOtherPartyProject.deleteMany({
          where: {
            otherPartyId: before.id,
            projectId: { notIn: after.projectIds },
          },
        });
        await tx.constructionFinanceOtherPartyProject.createMany({
          data: after.projectIds.map((projectId) => ({
            otherPartyId: before.id,
            projectId,
          })),
          skipDuplicates: true,
        });
        await recordAudit(tx, {
          workspaceId: before.workspaceId,
          actorUserId: after.updatedBy,
          action: "other_party.updated",
          entityType: "other_party",
          entityId: before.id,
          before: snapshot(before),
          after: snapshot(after),
          occurredAt: after.updatedAt,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw otherPartyNameTaken(after.name);
      throw error;
    }
  }

  async delete(input: Parameters<OtherPartyStore["delete"]>[0]) {
    const { party, by, now } = input;
    await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ updatedAt: Date }[]>(
        Prisma.sql`SELECT updated_at AS "updatedAt"
          FROM construction_finance.other_parties
          WHERE id = ${party.id}::uuid AND workspace_id = ${party.workspaceId}
            AND deleted_at IS NULL
          FOR UPDATE`,
      );
      const row = locked[0];
      if (row == null) throw otherPartyNotFound();
      if (
        input.expectedUpdatedAt != null &&
        row.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
      )
        throw otherPartyChanged();
      const used = await tx.$queryRaw<{ used: boolean }[]>(
        Prisma.sql`SELECT (
            EXISTS (SELECT 1 FROM construction_finance.invoices
              WHERE party_type = 'other_party' AND party_id = ${party.id}::uuid
                AND deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM construction_finance.party_payments
              WHERE party_type = 'other_party' AND party_id = ${party.id}::uuid
                AND deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM construction_finance.party_openings
              WHERE party_type = 'other_party' AND party_id = ${party.id}::uuid
                AND deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM construction_finance.party_entries
              WHERE party_type = 'other_party' AND party_id = ${party.id}::uuid)
          ) AS used`,
      );
      if (used[0]?.used === true) throw otherPartyInUse();
      await tx.constructionFinanceOtherParty.update({
        where: { id: party.id },
        data: { deletedAt: now, deletedBy: by, updatedAt: now, updatedBy: by },
      });
      await recordAudit(tx, {
        workspaceId: party.workspaceId,
        actorUserId: by,
        action: "other_party.deleted",
        entityType: "other_party",
        entityId: party.id,
        before: snapshot(party),
        occurredAt: now,
      });
    });
  }
}

/** Other Parties (CM-704) over Prisma and the composition's directory. */
export function createOtherPartyHandlers(deps: {
  directory: Pick<FinanceDirectory, "projects">;
  prisma?: PrismaClient;
}): OtherPartyHandlers {
  return new OtherPartyHandlers(
    new PrismaOtherPartyStore(deps.prisma ?? prisma, deps.directory),
  );
}
