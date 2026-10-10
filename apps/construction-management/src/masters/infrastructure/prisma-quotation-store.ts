import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { notFound } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import {
  quotationsLimit,
  type QuotationListParams,
  type QuotationStore,
  type StoredQuotation,
} from "../application/party-quotations";
import type { PartyKind } from "../domain/party";
import type { Quotation } from "../domain/quotation";
import { isUniqueViolation } from "./prisma-lookup-store";
import { pageOf, pageQuery } from "./prisma-paging";

type Row = Prisma.ConstructionMastersQuotationGetPayload<object>;

function toQuotation(row: Row): StoredQuotation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    partyKind: row.partyKind,
    partyId: row.partyId,
    fileKey: row.fileKey,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    thumbKey: row.thumbKey,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    deletedAt: row.deletedAt,
  };
}

const PARTY_TABLES: Record<PartyKind, Prisma.Sql> = {
  contractor: Prisma.sql`construction_masters.contractors`,
  supplier: Prisma.sql`construction_masters.suppliers`,
};

/**
 * `construction_masters.quotations` (CM-501). Adding locks the party row, so
 * two uploads finishing together cannot pass the per-party limit and a
 * party deleted meanwhile gets no new files.
 */
export class PrismaQuotationStore implements QuotationStore {
  constructor(private readonly db: PrismaClient) {}

  async partyName(kind: PartyKind, workspaceId: string, partyId: string) {
    const where = { id: partyId, workspaceId, deletedAt: null };
    const row =
      kind === "contractor"
        ? await this.db.constructionMastersContractor.findFirst({
            where,
            select: { name: true },
          })
        : await this.db.constructionMastersSupplier.findFirst({
            where,
            select: { name: true },
          });
    return row?.name ?? null;
  }

  async listForParty(kind: PartyKind, workspaceId: string, partyId: string) {
    const rows = await this.db.constructionMastersQuotation.findMany({
      where: { workspaceId, partyKind: kind, partyId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toQuotation);
  }

  async list(params: QuotationListParams) {
    const search = params.search?.trim() ?? "";
    const contains = { contains: search, mode: "insensitive" as const };
    // Only quotations of live parties; a search matches the party or the file.
    const [contractors, suppliers] = await Promise.all(
      (["contractor", "supplier"] as const).map(async (kind) => {
        if (params.partyKind != null && params.partyKind !== kind) return [];
        const where = { workspaceId: params.workspaceId, deletedAt: null };
        const rows =
          kind === "contractor"
            ? await this.db.constructionMastersContractor.findMany({
                where,
                select: { id: true, name: true },
              })
            : await this.db.constructionMastersSupplier.findMany({
                where,
                select: { id: true, name: true },
              });
        return rows;
      }),
    );
    const names = new Map<string, string>();
    for (const row of [...(contractors ?? []), ...(suppliers ?? [])])
      names.set(row.id, row.name);
    const matching = (rows: { id: string; name: string }[]) =>
      rows
        .filter(
          (row) =>
            search === "" ||
            row.name.toLowerCase().includes(search.toLowerCase()),
        )
        .map((row) => row.id);
    const partyFilter = (
      kind: PartyKind,
      rows: { id: string; name: string }[] | undefined,
    ): Prisma.ConstructionMastersQuotationWhereInput | null =>
      rows == null || (params.partyKind != null && params.partyKind !== kind)
        ? null
        : {
            partyKind: kind,
            OR: [
              { partyId: { in: matching(rows) } },
              ...(search === ""
                ? []
                : [
                    {
                      partyId: { in: rows.map((row) => row.id) },
                      fileName: contains,
                    },
                  ]),
            ],
          };
    const parties = [
      partyFilter("contractor", contractors),
      partyFilter("supplier", suppliers),
    ].filter((item) => item != null);
    const filters: Prisma.ConstructionMastersQuotationWhereInput[] = [
      { workspaceId: params.workspaceId, deletedAt: null },
      { OR: parties },
    ];
    const page = pageQuery(params);
    const [rows, total] = await Promise.all([
      this.db.constructionMastersQuotation.findMany({
        where: { AND: page.filter == null ? filters : [...filters, page.filter] },
        orderBy: page.orderBy,
        take: page.take,
      }),
      this.db.constructionMastersQuotation.count({ where: { AND: filters } }),
    ]);
    const { items, hasMore } = pageOf(rows, params);
    return {
      items: items.map((row) => ({
        ...toQuotation(row),
        partyName: names.get(row.partyId) ?? "",
      })),
      total,
      hasMore,
    };
  }

  async count(kind: PartyKind, workspaceId: string, partyId: string) {
    return this.db.constructionMastersQuotation.count({
      where: { workspaceId, partyKind: kind, partyId, deletedAt: null },
    });
  }

  async find(
    kind: PartyKind,
    workspaceId: string,
    partyId: string,
    id: string,
  ): Promise<Quotation | null> {
    const row = await this.db.constructionMastersQuotation.findFirst({
      where: { id, workspaceId, partyKind: kind, partyId, deletedAt: null },
    });
    return row == null ? null : toQuotation(row);
  }

  async findByKey(workspaceId: string, key: string) {
    const row = await this.db.constructionMastersQuotation.findFirst({
      where: { fileKey: key, workspaceId },
    });
    return row == null ? null : toQuotation(row);
  }

  async add(input: Parameters<QuotationStore["add"]>[0]) {
    const { quotation } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id::text AS id FROM ${PARTY_TABLES[quotation.partyKind]}
          WHERE id = ${quotation.partyId}::uuid
            AND workspace_id = ${quotation.workspaceId}
            AND deleted_at IS NULL
          FOR UPDATE
        `);
        if (locked.length === 0)
          throw notFound(
            `${quotation.partyKind.toUpperCase()}_NOT_FOUND`,
            "This party was not found.",
          );
        const live = await tx.constructionMastersQuotation.count({
          where: {
            workspaceId: quotation.workspaceId,
            partyKind: quotation.partyKind,
            partyId: quotation.partyId,
            deletedAt: null,
          },
        });
        if (live >= input.max) throw quotationsLimit(quotation.partyKind);
        await tx.constructionMastersQuotation.create({
          data: {
            id: quotation.id,
            workspaceId: quotation.workspaceId,
            partyKind: quotation.partyKind,
            partyId: quotation.partyId,
            fileKey: quotation.fileKey,
            fileName: quotation.fileName,
            contentType: quotation.contentType,
            bytes: quotation.bytes,
            thumbKey: quotation.thumbKey,
            createdAt: quotation.createdAt,
            createdBy: quotation.createdBy,
          },
        });
        await recordStoredFile(tx, input.file);
        if (input.thumbnail != null)
          await recordStoredFile(tx, input.thumbnail);
        await recordAudit(tx, input.audit);
      });
      return "added" as const;
    } catch (error) {
      if (isUniqueViolation(error)) return "duplicate" as const;
      throw error;
    }
  }

  async remove(input: Parameters<QuotationStore["remove"]>[0]) {
    const { quotation } = input;
    return this.db.$transaction(async (tx) => {
      const written = await tx.constructionMastersQuotation.updateMany({
        where: {
          id: quotation.id,
          workspaceId: quotation.workspaceId,
          deletedAt: null,
        },
        data: { deletedAt: input.now, deletedBy: input.by },
      });
      if (written.count === 0) return false;
      await markStoredFileDeleted(
        tx,
        quotation.workspaceId,
        quotation.fileKey,
        input.now,
      );
      if (quotation.thumbKey != null)
        await markStoredFileDeleted(
          tx,
          quotation.workspaceId,
          quotation.thumbKey,
          input.now,
        );
      await recordAudit(tx, input.audit);
      return true;
    });
  }

  async uploaderNames(workspaceId: string, userIds: readonly string[]) {
    if (userIds.length === 0) return new Map<string, string>();
    const rows = await this.db.$queryRaw<{ userId: string; name: string }[]>(
      Prisma.sql`
        SELECT DISTINCT ON (user_id) user_id AS "userId", name
        FROM construction_organization.team_members
        WHERE workspace_id = ${workspaceId}
          AND user_id = ANY(${[...userIds]}::text[])
        ORDER BY user_id, (deleted_at IS NULL) DESC, created_at DESC
      `,
    );
    return new Map(rows.map((row) => [row.userId, row.name]));
  }
}
