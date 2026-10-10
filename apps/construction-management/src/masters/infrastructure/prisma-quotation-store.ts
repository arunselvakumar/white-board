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
import { pageOf } from "./prisma-paging";

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
    const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    // Only quotations of live parties; a search matches the party or the
    // file. One query joins the parties, so the cost follows the page, not
    // the number of Contractors and Suppliers (CM-501 review).
    const parties = Prisma.sql`
      SELECT 'contractor'::text AS kind, id, name
      FROM construction_masters.contractors
      WHERE workspace_id = ${params.workspaceId} AND deleted_at IS NULL
      UNION ALL
      SELECT 'supplier'::text AS kind, id, name
      FROM construction_masters.suppliers
      WHERE workspace_id = ${params.workspaceId} AND deleted_at IS NULL`;
    const where = Prisma.sql`
      q.workspace_id = ${params.workspaceId}
      AND q.deleted_at IS NULL
      ${params.partyKind == null ? Prisma.empty : Prisma.sql`AND p.kind = ${params.partyKind}`}
      ${search === "" ? Prisma.empty : Prisma.sql`AND (p.name ILIKE ${like} OR q.file_name ILIKE ${like})`}`;
    const from = Prisma.sql`
      FROM construction_masters.quotations q
      JOIN (${parties}) p ON p.kind = q.party_kind::text AND p.id = q.party_id`;
    const page =
      cursor == null
        ? Prisma.empty
        : backwards
          ? Prisma.sql`AND (q.created_at, q.id) > (${cursor.createdAt}, ${cursor.id}::uuid)`
          : Prisma.sql`AND (q.created_at, q.id) < (${cursor.createdAt}, ${cursor.id}::uuid)`;
    const order = backwards
      ? Prisma.sql`ORDER BY q.created_at ASC, q.id ASC`
      : Prisma.sql`ORDER BY q.created_at DESC, q.id DESC`;
    const [rows, counted] = await Promise.all([
      this.db.$queryRaw<(Row & { partyName: string })[]>(Prisma.sql`
        SELECT q.id, q.workspace_id AS "workspaceId",
               q.party_kind::text AS "partyKind", q.party_id AS "partyId",
               q.file_key AS "fileKey", q.file_name AS "fileName",
               q.content_type AS "contentType", q.bytes,
               q.thumb_key AS "thumbKey", q.created_at AS "createdAt",
               q.created_by AS "createdBy", q.deleted_at AS "deletedAt",
               q.deleted_by AS "deletedBy", p.name AS "partyName"
        ${from}
        WHERE ${where} ${page}
        ${order}
        LIMIT ${params.limit + 1}`),
      this.db.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total ${from} WHERE ${where}`),
    ]);
    const { items, hasMore } = pageOf(rows, params);
    return {
      items: items.map((row) => ({
        ...toQuotation(row),
        partyName: row.partyName,
      })),
      total: Number(counted[0]?.total ?? 0),
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
