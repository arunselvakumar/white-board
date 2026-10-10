import type { PrismaClient } from "@repo/construction-db";

import type {
  LocationView,
  PhaseView,
  ProjectStructureReader,
  WingSummary,
  WingTree,
} from "../application/structure-read-model";
import { withLiveFloors } from "./prisma-wing-repository";

const live = { deletedAt: null };

function byPhaseThenWing(
  a: { phase: { position: number }; position: number; createdAt: Date },
  b: { phase: { position: number }; position: number; createdAt: Date },
): number {
  return (
    a.phase.position - b.phase.position ||
    a.position - b.position ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

/**
 * Reads of a Project's structure from `construction_projects` (CM-402,
 * CM-405): live rows only, in screen order.
 */
export class PrismaProjectStructureReader implements ProjectStructureReader {
  constructor(private readonly db: PrismaClient) {}

  async phases(workspaceId: string, projectId: string): Promise<PhaseView[]> {
    const rows = await this.db.constructionProjectsPhase.findMany({
      where: { workspaceId, projectId, ...live },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      include: { _count: { select: { wings: { where: live } } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      wings: row._count.wings,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async wingSummaries(
    workspaceId: string,
    projectId: string,
  ): Promise<WingSummary[]> {
    const rows = await this.db.constructionProjectsWing.findMany({
      where: { workspaceId, projectId, ...live, phase: live },
      include: {
        phase: { select: { position: true } },
        _count: {
          select: { floors: { where: live }, units: { where: live } },
        },
      },
    });
    return rows.sort(byPhaseThenWing).map((row) => ({
      id: row.id,
      phaseId: row.phaseId,
      type: row.wingType,
      name: row.name,
      position: row.position,
      floors: row._count.floors,
      units: row._count.units,
      updatedAt: row.updatedAt,
    }));
  }

  async wings(workspaceId: string, projectId: string): Promise<WingTree[]> {
    const rows = await this.db.constructionProjectsWing.findMany({
      where: { workspaceId, projectId, ...live, phase: live },
      include: {
        ...withLiveFloors,
        phase: { select: { name: true, position: true } },
      },
    });
    return rows.sort(byPhaseThenWing).map((row) => ({
      id: row.id,
      phaseId: row.phaseId,
      phaseName: row.phase.name,
      type: row.wingType,
      name: row.name,
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
    }));
  }

  async locations(
    workspaceId: string,
    projectId: string,
  ): Promise<LocationView[]> {
    const rows = await this.db.constructionProjectsLocation.findMany({
      where: { workspaceId, projectId, ...live },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }
}
