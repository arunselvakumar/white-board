import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type { LookupStore, MasterChange } from "../application/ports";
import { LookupEntry } from "../domain/lookup-entry";
import {
  masterChanged,
  masterNameInUse,
  type LookupKind,
} from "../domain/master-kind";

type Row = Prisma.ConstructionMastersLabourCategoryGetPayload<object>;

type Tables = Pick<
  PrismaClient,
  "constructionMastersLabourCategory" | "constructionMastersDepartment"
>;

/** `labour_categories` and `departments` have the same columns. */
type LookupTable = Tables["constructionMastersLabourCategory"];

export function lookupTable(db: Tables, kind: LookupKind): LookupTable {
  return kind === "labour_category"
    ? db.constructionMastersLabourCategory
    : (db.constructionMastersDepartment as unknown as LookupTable);
}

function toEntry(kind: LookupKind, row: Row): LookupEntry {
  return LookupEntry.reconstitute({
    id: row.id,
    kind,
    workspaceId: row.workspaceId,
    name: row.name,
    isSeed: row.isSeed,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  });
}

export function lookupEntryData(entry: LookupEntry) {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    name: entry.name,
    isSeed: entry.isSeed,
    disabledAt: entry.disabledAt,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    createdBy: entry.createdBy,
    updatedBy: entry.updatedBy,
    deletedAt: entry.deletedAt,
    deletedBy: entry.deletedBy,
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function audit(entry: LookupEntry, change: MasterChange) {
  return {
    workspaceId: entry.workspaceId,
    actorUserId: change.by,
    action: change.action,
    entityType: entry.kind,
    entityId: entry.id,
    before: change.before,
    after: entry.deletedAt == null ? entry.snapshot() : null,
    occurredAt: change.now,
  };
}

/** Labour Categories and Departments in `construction_masters` (CM-203). */
export class PrismaLookupStore implements LookupStore {
  constructor(private readonly db: PrismaClient) {}

  async list(kind: LookupKind, workspaceId: string): Promise<LookupEntry[]> {
    const rows = await lookupTable(this.db, kind).findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => toEntry(kind, row));
  }

  async find(
    kind: LookupKind,
    workspaceId: string,
    id: string,
  ): Promise<LookupEntry | null> {
    const row = await lookupTable(this.db, kind).findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toEntry(kind, row);
  }

  async insert(entry: LookupEntry, change: MasterChange): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await lookupTable(tx, entry.kind).create({
          data: lookupEntryData(entry),
        });
        await recordAudit(tx, audit(entry, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw masterNameInUse(entry.kind);
      throw error;
    }
  }

  async update(
    entry: LookupEntry,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Compare-and-set on updatedAt: a stale write changes no row.
        const updated = await lookupTable(tx, entry.kind).updateMany({
          where: {
            id: entry.id,
            workspaceId: entry.workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            name: entry.name,
            disabledAt: entry.disabledAt,
            updatedAt: entry.updatedAt,
            updatedBy: entry.updatedBy,
            deletedAt: entry.deletedAt,
            deletedBy: entry.deletedBy,
          },
        });
        if (updated.count === 0) throw masterChanged(entry.kind);
        await recordAudit(tx, audit(entry, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw masterNameInUse(entry.kind);
      throw error;
    }
  }
}
