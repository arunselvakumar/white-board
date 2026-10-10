import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";

import { Phase, phaseNotFound } from "../domain/phase";
import type { PhaseRepository } from "../domain/structure-repository";

type Row = Prisma.ConstructionProjectsPhaseGetPayload<object>;

type Tx = Prisma.TransactionClient;

export function toPhase(row: Row): Phase {
  return Phase.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    name: row.name,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function phaseNameInUse() {
  return conflict(
    "PHASE_NAME_IN_USE",
    "A Phase with this name already exists on this Project.",
  );
}

/** Creates the Phase row; 409 `PHASE_NAME_IN_USE` for a live duplicate. */
export async function createPhaseRow(tx: Tx, phase: Phase): Promise<void> {
  try {
    await tx.constructionProjectsPhase.create({
      data: {
        id: phase.id,
        workspaceId: phase.workspaceId,
        projectId: phase.projectId,
        name: phase.name,
        position: phase.position,
        createdAt: phase.createdAt,
        updatedAt: phase.updatedAt,
        createdBy: phase.createdBy,
        updatedBy: phase.updatedBy,
      },
    });
  } catch (error) {
    throw isUniqueViolation(error) ? phaseNameInUse() : error;
  }
}

/**
 * Locks a live Phase of the Project for the rest of the transaction, so a
 * Wing cannot land in a Phase being deleted; 404 `PHASE_NOT_FOUND`.
 */
export async function lockPhase(
  tx: Tx,
  workspaceId: string,
  projectId: string,
  phaseId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id::text AS id FROM construction_projects.phases
    WHERE id = ${phaseId}::uuid
      AND workspace_id = ${workspaceId}
      AND project_id = ${projectId}::uuid
      AND deleted_at IS NULL
    FOR UPDATE
  `);
  if (rows.length === 0) throw phaseNotFound();
}

/** `construction_projects.phases`; names unique among a Project's live rows. */
export class PrismaPhaseRepository implements PhaseRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string, projectId: string): Promise<Phase[]> {
    const rows = await this.db.constructionProjectsPhase.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toPhase);
  }

  async find(
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<Phase | null> {
    const row = await this.db.constructionProjectsPhase.findFirst({
      where: { id, workspaceId, projectId, deletedAt: null },
    });
    return row == null ? null : toPhase(row);
  }

  async insert(phase: Phase, audit: AuditEvent): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await createPhaseRow(tx, phase);
      await recordAudit(tx, audit);
    });
  }

  async update(
    phase: Phase,
    expectedUpdatedAt: Date,
    audit: AuditEvent,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      let updated: { count: number };
      try {
        updated = await tx.constructionProjectsPhase.updateMany({
          where: {
            id: phase.id,
            workspaceId: phase.workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            name: phase.name,
            updatedAt: phase.updatedAt,
            updatedBy: phase.updatedBy,
          },
        });
      } catch (error) {
        throw isUniqueViolation(error) ? phaseNameInUse() : error;
      }
      if (updated.count === 0)
        throw conflict(
          "PHASE_CHANGED",
          "Someone else changed this Phase after you opened it. Reload to see their changes.",
        );
      await recordAudit(tx, audit);
    });
  }

  async delete(phase: Phase, audit: AuditEvent): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await lockPhase(tx, phase.workspaceId, phase.projectId, phase.id);
      const wings = await tx.constructionProjectsWing.count({
        where: { phaseId: phase.id, deletedAt: null },
      });
      if (wings > 0)
        throw conflict(
          "PHASE_NOT_EMPTY",
          "This Phase has Wings. Delete or move them first.",
        );
      await tx.constructionProjectsPhase.update({
        where: { id: phase.id },
        data: {
          deletedAt: phase.deletedAt,
          deletedBy: phase.updatedBy,
          updatedAt: phase.updatedAt,
          updatedBy: phase.updatedBy,
        },
      });
      await recordAudit(tx, audit);
    });
  }
}
