import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";

import type { Phase } from "../domain/phase";
import type { WingRepository } from "../domain/structure-repository";
import {
  Wing,
  wingNotFound,
  type WingFloor,
  type WingRemovals,
} from "../domain/wing";
import type { WingConfig } from "../domain/wing-generator";
import {
  createPhaseRow,
  isUniqueViolation,
  lockPhase,
} from "./prisma-phase-repository";

type Tx = Prisma.TransactionClient;

/** Live floors top to bottom, each with its live units in order. */
export const withLiveFloors = {
  floors: {
    where: { deletedAt: null },
    orderBy: [{ level: "desc" }, { id: "asc" }],
    include: {
      units: {
        where: { deletedAt: null },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      },
    },
  },
} satisfies Prisma.ConstructionProjectsWingInclude;

type Row = Prisma.ConstructionProjectsWingGetPayload<{
  include: typeof withLiveFloors;
}>;

/** Rows per bulk statement, well inside Postgres' parameter limit. */
const CHUNK = 1000;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += CHUNK)
    out.push(items.slice(index, index + CHUNK));
  return out;
}

function toWing(row: Row): Wing {
  return Wing.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    phaseId: row.phaseId,
    type: row.wingType,
    name: row.name,
    // Written only from a checked configuration (`wingConfig`).
    config: row.config as WingConfig,
    position: row.position,
    floors: row.floors.map((floor) => ({
      id: floor.id,
      kind: floor.kind,
      name: floor.name,
      level: floor.level,
      units: floor.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        position: unit.position,
      })),
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

function wingNameInUse() {
  return conflict(
    "WING_NAME_IN_USE",
    "A Wing with this name already exists on this Project.",
  );
}

function unitNameInUse() {
  return conflict(
    "WING_UNIT_NAME_DUPLICATE",
    "Two units in this Wing have the same name. Reload and try again.",
  );
}

async function createFloors(
  tx: Tx,
  wing: Wing,
  floors: readonly WingFloor[],
): Promise<void> {
  for (const part of chunks(floors))
    await tx.constructionProjectsFloor.createMany({
      data: part.map((floor) => ({
        id: floor.id,
        workspaceId: wing.workspaceId,
        wingId: wing.id,
        kind: floor.kind,
        name: floor.name,
        level: floor.level,
      })),
    });
}

type UnitRow = { id: string; floorId: string; name: string; position: number };

async function createUnits(
  tx: Tx,
  wing: Wing,
  units: readonly UnitRow[],
): Promise<void> {
  try {
    for (const part of chunks(units))
      await tx.constructionProjectsUnit.createMany({
        data: part.map((unit) => ({
          id: unit.id,
          workspaceId: wing.workspaceId,
          wingId: wing.id,
          floorId: unit.floorId,
          name: unit.name,
          position: unit.position,
        })),
      });
  } catch (error) {
    throw isUniqueViolation(error) ? unitNameInUse() : error;
  }
}

function unitRows(floors: readonly WingFloor[]): UnitRow[] {
  return floors.flatMap((floor) =>
    floor.units.map((unit) => ({
      id: unit.id,
      floorId: floor.id,
      name: unit.name,
      position: unit.position,
    })),
  );
}

/**
 * `construction_projects.wings` with `floors` and `units`. A save is one
 * transaction: the Wing row is compare-and-set on `updatedAt`, kept rows
 * are updated in bulk only where they changed, and removed rows are
 * tombstoned so site entries naming them still resolve.
 */
export class PrismaWingRepository implements WingRepository {
  constructor(private readonly db: PrismaClient) {}

  async find(
    workspaceId: string,
    projectId: string,
    id: string,
  ): Promise<Wing | null> {
    const row = await this.db.constructionProjectsWing.findFirst({
      where: { id, workspaceId, projectId, deletedAt: null },
      include: withLiveFloors,
    });
    return row == null ? null : toWing(row);
  }

  async nextPosition(workspaceId: string, phaseId: string): Promise<number> {
    const found = await this.db.constructionProjectsWing.aggregate({
      where: { workspaceId, phaseId, deletedAt: null },
      _max: { position: true },
    });
    return (found._max.position ?? -1) + 1;
  }

  async insert(
    wing: Wing,
    audit: AuditEvent,
    phase?: { phase: Phase; audit: AuditEvent },
  ): Promise<void> {
    await this.db.$transaction(
      async (tx) => {
        if (phase != null) {
          await createPhaseRow(tx, phase.phase);
          await recordAudit(tx, phase.audit);
        } else {
          await lockPhase(tx, wing.workspaceId, wing.projectId, wing.phaseId);
        }
        try {
          await tx.constructionProjectsWing.create({
            data: {
              id: wing.id,
              workspaceId: wing.workspaceId,
              projectId: wing.projectId,
              phaseId: wing.phaseId,
              wingType: wing.type,
              name: wing.name,
              config: wing.config,
              position: wing.position,
              createdAt: wing.createdAt,
              updatedAt: wing.updatedAt,
              createdBy: wing.createdBy,
              updatedBy: wing.updatedBy,
            },
          });
        } catch (error) {
          throw isUniqueViolation(error) ? wingNameInUse() : error;
        }
        await createFloors(tx, wing, wing.floors);
        await createUnits(tx, wing, unitRows(wing.floors));
        await recordAudit(tx, audit);
      },
      { timeout: 30_000 },
    );
  }

  async update(
    wing: Wing,
    expectedUpdatedAt: Date,
    removals: WingRemovals,
    audit: AuditEvent,
  ): Promise<void> {
    const by = wing.updatedBy;
    const now = wing.updatedAt;
    await this.db.$transaction(
      async (tx) => {
        await lockPhase(tx, wing.workspaceId, wing.projectId, wing.phaseId);
        let written: { count: number };
        try {
          // Compare-and-set on updatedAt: a stale save changes no row.
          written = await tx.constructionProjectsWing.updateMany({
            where: {
              id: wing.id,
              workspaceId: wing.workspaceId,
              deletedAt: null,
              updatedAt: expectedUpdatedAt,
            },
            data: {
              name: wing.name,
              phaseId: wing.phaseId,
              position: wing.position,
              updatedAt: now,
              updatedBy: by,
            },
          });
        } catch (error) {
          throw isUniqueViolation(error) ? wingNameInUse() : error;
        }
        if (written.count === 0)
          throw conflict(
            "WING_CHANGED",
            "Someone else changed this Wing after you opened it. Reload to see their changes.",
          );

        const [storedFloors, storedUnits] = await Promise.all([
          tx.constructionProjectsFloor.findMany({
            where: { wingId: wing.id, deletedAt: null },
            select: { id: true, name: true, level: true },
          }),
          tx.constructionProjectsUnit.findMany({
            where: { wingId: wing.id, deletedAt: null },
            select: { id: true, floorId: true, name: true, position: true },
          }),
        ]);

        if (removals.unitIds.length > 0)
          await tx.constructionProjectsUnit.updateMany({
            where: { wingId: wing.id, id: { in: removals.unitIds } },
            data: { deletedAt: now, deletedBy: by },
          });
        if (removals.floorIds.length > 0)
          await tx.constructionProjectsFloor.updateMany({
            where: { wingId: wing.id, id: { in: removals.floorIds } },
            data: { deletedAt: now, deletedBy: by },
          });

        const floorsById = new Map(storedFloors.map((row) => [row.id, row]));
        const newFloors = wing.floors.filter(
          (floor) => !floorsById.has(floor.id),
        );
        const changedFloors = wing.floors.filter((floor) => {
          const stored = floorsById.get(floor.id);
          return (
            stored != null &&
            (stored.name !== floor.name || stored.level !== floor.level)
          );
        });
        await createFloors(tx, wing, newFloors);
        for (const part of chunks(changedFloors))
          await tx.$executeRaw(Prisma.sql`
            UPDATE construction_projects.floors AS f
            SET name = v.name, level = v.level
            FROM (VALUES ${Prisma.join(
              part.map(
                (floor) =>
                  Prisma.sql`(${floor.id}::uuid, ${floor.name}, ${floor.level}::int)`,
              ),
            )}) AS v (id, name, level)
            WHERE f.id = v.id AND f.wing_id = ${wing.id}::uuid
          `);

        const unitsById = new Map(storedUnits.map((row) => [row.id, row]));
        const rows = unitRows(wing.floors);
        const newUnits = rows.filter((unit) => !unitsById.has(unit.id));
        const changedUnits = rows.filter((unit) => {
          const stored = unitsById.get(unit.id);
          return (
            stored != null &&
            (stored.name !== unit.name ||
              stored.floorId !== unit.floorId ||
              stored.position !== unit.position)
          );
        });
        const renamed = changedUnits.filter(
          (unit) => unitsById.get(unit.id)?.name !== unit.name,
        );
        // Names are unique per Wing as each row is written; park renamed
        // units on a name no unit can have (> 30 characters) so swaps and
        // new units taking an old name pass.
        for (const part of chunks(renamed))
          await tx.$executeRaw(Prisma.sql`
            UPDATE construction_projects.units
            SET name = '~' || id::text
            WHERE wing_id = ${wing.id}::uuid
              AND id IN (${Prisma.join(part.map((unit) => Prisma.sql`${unit.id}::uuid`))})
          `);
        await createUnits(tx, wing, newUnits);
        try {
          for (const part of chunks(changedUnits))
            await tx.$executeRaw(Prisma.sql`
              UPDATE construction_projects.units AS u
              SET name = v.name, floor_id = v.floor_id, position = v.position
              FROM (VALUES ${Prisma.join(
                part.map(
                  (unit) =>
                    Prisma.sql`(${unit.id}::uuid, ${unit.name}, ${unit.floorId}::uuid, ${unit.position}::int)`,
                ),
              )}) AS v (id, name, floor_id, position)
              WHERE u.id = v.id AND u.wing_id = ${wing.id}::uuid
            `);
        } catch (error) {
          throw isUniqueViolation(error) ? unitNameInUse() : error;
        }
        await recordAudit(tx, audit);
      },
      { timeout: 30_000 },
    );
  }

  async delete(wing: Wing, audit: AuditEvent): Promise<void> {
    const by = wing.updatedBy;
    const now = wing.updatedAt;
    await this.db.$transaction(async (tx) => {
      const deleted = await tx.constructionProjectsWing.updateMany({
        where: { id: wing.id, workspaceId: wing.workspaceId, deletedAt: null },
        data: {
          deletedAt: now,
          deletedBy: by,
          updatedAt: now,
          updatedBy: by,
        },
      });
      if (deleted.count === 0) throw wingNotFound();
      await tx.constructionProjectsUnit.updateMany({
        where: { wingId: wing.id, deletedAt: null },
        data: { deletedAt: now, deletedBy: by },
      });
      await tx.constructionProjectsFloor.updateMany({
        where: { wingId: wing.id, deletedAt: null },
        data: { deletedAt: now, deletedBy: by },
      });
      await recordAudit(tx, audit);
    });
  }
}
