import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type { MasterChange } from "../application/ports";
import type { TrackingMasterStore } from "../application/tracking-master-handlers";
import {
  masterChanged,
  masterInUse,
  masterNameInUse,
  type TrackingMasterKind,
} from "../domain/master-kind";
import {
  trackingMasterSnapshot,
  type TrackingMaster,
} from "../domain/tracking-master";

type Tx = Prisma.TransactionClient;

type Row = {
  id: string;
  workspaceId: string;
  name: string;
  isSeed?: boolean;
  disabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** The two tables share every column a Tag has; Issue Categories add two. */
type Delegate = {
  findMany(args: object): Promise<Row[]>;
  findFirst(args: object): Promise<Row | null>;
  create(args: object): Promise<unknown>;
  updateMany(args: object): Promise<{ count: number }>;
};

function table(db: PrismaClient | Tx, kind: TrackingMasterKind): Delegate {
  const delegate: unknown =
    kind === "tag"
      ? db.constructionMastersTag
      : db.constructionMastersIssueCategory;
  return delegate as Delegate;
}

const TABLES: Record<TrackingMasterKind, Prisma.Sql> = {
  issue_category: Prisma.sql`construction_masters.issue_categories`,
  tag: Prisma.sql`construction_masters.tags`,
};

function toMaster(kind: TrackingMasterKind, row: Row): TrackingMaster {
  return {
    id: row.id,
    kind,
    workspaceId: row.workspaceId,
    name: row.name,
    isSeed: row.isSeed ?? false,
    disabledAt: row.disabledAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function audit(row: TrackingMaster, change: MasterChange, deleted = false) {
  return {
    workspaceId: row.workspaceId,
    actorUserId: change.by,
    action: change.action,
    entityType: row.kind,
    entityId: row.id,
    before: change.before,
    after: deleted ? null : trackingMasterSnapshot(row),
    occurredAt: change.now,
  };
}

async function write(
  kind: TrackingMasterKind,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (isUniqueViolation(error)) throw masterNameInUse(kind);
    throw error;
  }
}

/** `construction_masters.issue_categories` and `tags` (CM-801). */
export class PrismaTrackingMasterStore implements TrackingMasterStore {
  constructor(private readonly db: PrismaClient) {}

  async list(kind: TrackingMasterKind, workspaceId: string) {
    const rows = await table(this.db, kind).findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => toMaster(kind, row));
  }

  async find(kind: TrackingMasterKind, workspaceId: string, id: string) {
    const row = await table(this.db, kind).findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toMaster(kind, row);
  }

  async findByName(
    kind: TrackingMasterKind,
    workspaceId: string,
    name: string,
  ) {
    const row = await table(this.db, kind).findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
      },
    });
    return row == null ? null : toMaster(kind, row);
  }

  async insert(row: TrackingMaster, change: MasterChange) {
    await write(row.kind, () =>
      this.db.$transaction(async (tx) => {
        await table(tx, row.kind).create({
          data: {
            id: row.id,
            workspaceId: row.workspaceId,
            name: row.name,
            ...(row.kind === "issue_category"
              ? { isSeed: row.isSeed, disabledAt: row.disabledAt }
              : {}),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            createdBy: row.createdBy,
            updatedBy: row.updatedBy,
          },
        });
        await recordAudit(tx, audit(row, change));
      }),
    );
  }

  async update(row: TrackingMaster, expected: Date, change: MasterChange) {
    await write(row.kind, () =>
      this.db.$transaction(async (tx) => {
        const written = await table(tx, row.kind).updateMany({
          where: {
            id: row.id,
            workspaceId: row.workspaceId,
            deletedAt: null,
            updatedAt: expected,
          },
          data: {
            name: row.name,
            ...(row.kind === "issue_category"
              ? { disabledAt: row.disabledAt }
              : {}),
            updatedAt: row.updatedAt,
            updatedBy: row.updatedBy,
          },
        });
        if (written.count === 0) throw masterChanged(row.kind);
        await recordAudit(tx, audit(row, change));
      }),
    );
  }

  async remove(
    row: TrackingMaster,
    expected: Date,
    change: MasterChange,
    stillUnused: () => Promise<boolean>,
  ) {
    await this.db.$transaction(async (tx) => {
      // Holds the row, so two deletes (or a rename) cannot interleave.
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM ${TABLES[row.kind]}
        WHERE id = ${row.id}::uuid AND workspace_id = ${row.workspaceId}
        FOR UPDATE
      `);
      if (!(await stillUnused())) throw masterInUse(row.kind);
      const written = await table(tx, row.kind).updateMany({
        where: {
          id: row.id,
          workspaceId: row.workspaceId,
          deletedAt: null,
          updatedAt: expected,
        },
        data: {
          deletedAt: change.now,
          deletedBy: change.by,
          updatedAt: change.now,
          updatedBy: change.by,
        },
      });
      if (written.count === 0) throw masterChanged(row.kind);
      await recordAudit(tx, audit(row, change, true));
    });
  }
}
