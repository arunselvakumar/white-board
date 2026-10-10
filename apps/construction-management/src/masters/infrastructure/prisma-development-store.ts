import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type {
  DevelopmentRow,
  DevelopmentStore,
  MasterChange,
} from "../application/ports";
import { LookupEntry } from "../domain/lookup-entry";
import {
  masterChanged,
  masterNameInUse,
  type DevelopmentKind,
} from "../domain/master-kind";
import { isUniqueViolation, lookupEntryData } from "./prisma-lookup-store";

type Row = Prisma.ConstructionMastersDevelopmentTypeGetPayload<object>;

type Tx = Prisma.TransactionClient;

function toEntry(row: Row): LookupEntry<DevelopmentKind> {
  return LookupEntry.reconstitute({
    id: row.id,
    kind: row.kind,
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

function audit(entry: LookupEntry<DevelopmentKind>, change: MasterChange) {
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

/**
 * The live Projects each row is assigned to. Projects are the projects
 * context's, read by id from its table (no import of its code): links to
 * a deleted Project are kept but not shown or counted.
 */
async function liveProjectLinks(
  db: PrismaClient | Tx,
  developmentIds: readonly string[],
): Promise<Map<string, string[]>> {
  const links = new Map<string, string[]>();
  if (developmentIds.length === 0) return links;
  const rows = await db.$queryRaw<
    { developmentId: string; projectId: string }[]
  >(
    Prisma.sql`
      SELECT dp.development_id::text AS "developmentId",
             dp.project_id::text AS "projectId"
      FROM construction_masters.development_projects dp
      JOIN construction_projects.projects p
        ON p.id = dp.project_id AND p.deleted_at IS NULL
      WHERE dp.development_id = ANY(${[...developmentIds]}::uuid[])
      ORDER BY p.name, p.id
    `,
  );
  for (const row of rows)
    links.set(row.developmentId, [
      ...(links.get(row.developmentId) ?? []),
      row.projectId,
    ]);
  return links;
}

async function writeProjects(
  tx: Tx,
  developmentId: string,
  projectIds: readonly string[],
): Promise<void> {
  await tx.constructionMastersDevelopmentProject.deleteMany({
    where: { developmentId },
  });
  if (projectIds.length > 0)
    await tx.constructionMastersDevelopmentProject.createMany({
      data: projectIds.map((projectId) => ({ developmentId, projectId })),
      skipDuplicates: true,
    });
}

/** `construction_masters.development_types` and their Projects (CM-404). */
export class PrismaDevelopmentStore implements DevelopmentStore {
  constructor(private readonly db: PrismaClient) {}

  async list(
    kind: DevelopmentKind,
    workspaceId: string,
  ): Promise<DevelopmentRow[]> {
    const rows = await this.db.constructionMastersDevelopmentType.findMany({
      where: { workspaceId, kind, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const links = await liveProjectLinks(
      this.db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      entry: toEntry(row),
      projectIds: links.get(row.id) ?? [],
    }));
  }

  async find(
    kind: DevelopmentKind,
    workspaceId: string,
    id: string,
  ): Promise<DevelopmentRow | null> {
    const row = await this.db.constructionMastersDevelopmentType.findFirst({
      where: { id, workspaceId, kind, deletedAt: null },
    });
    if (row == null) return null;
    const links = await liveProjectLinks(this.db, [row.id]);
    return { entry: toEntry(row), projectIds: links.get(row.id) ?? [] };
  }

  async insert(
    entry: LookupEntry<DevelopmentKind>,
    projectIds: readonly string[],
    change: MasterChange,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.constructionMastersDevelopmentType.create({
          data: { ...lookupEntryData(entry), kind: entry.kind },
        });
        await writeProjects(tx, entry.id, projectIds);
        await recordAudit(tx, {
          ...audit(entry, change),
          after: { ...entry.snapshot(), projectIds },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw masterNameInUse(entry.kind);
      throw error;
    }
  }

  async update(
    entry: LookupEntry<DevelopmentKind>,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Compare-and-set on updatedAt: a stale write changes no row.
        const updated = await tx.constructionMastersDevelopmentType.updateMany({
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

  async setProjects(
    entry: LookupEntry<DevelopmentKind>,
    projectIds: readonly string[],
    change: MasterChange,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await writeProjects(tx, entry.id, projectIds);
      await recordAudit(tx, {
        ...audit(entry, change),
        after: { projectIds },
      });
    });
  }

  async listForProject(
    workspaceId: string,
    projectId: string,
  ): Promise<LookupEntry<DevelopmentKind>[]> {
    const rows = await this.db.constructionMastersDevelopmentType.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        projects: { some: { projectId } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toEntry);
  }

  async setForProject(input: {
    workspaceId: string;
    projectId: string;
    kind: DevelopmentKind;
    ids: readonly string[];
    before: readonly string[];
    by: string;
    now: Date;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // Only this Company's rows of this kind: links of the other kind,
      // and rows deleted since, stay as they are.
      await tx.constructionMastersDevelopmentProject.deleteMany({
        where: {
          projectId: input.projectId,
          development: {
            workspaceId: input.workspaceId,
            kind: input.kind,
            deletedAt: null,
          },
        },
      });
      if (input.ids.length > 0)
        await tx.constructionMastersDevelopmentProject.createMany({
          data: input.ids.map((developmentId) => ({
            developmentId,
            projectId: input.projectId,
          })),
          skipDuplicates: true,
        });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: `project.${input.kind}_assigned`,
        entityType: "project",
        entityId: input.projectId,
        before: { ids: input.before },
        after: { ids: input.ids },
        occurredAt: input.now,
      });
    });
  }
}
