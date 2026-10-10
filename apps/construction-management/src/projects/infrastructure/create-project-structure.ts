import { prisma, type PrismaClient } from "@repo/construction-db";

import { LocationHandlers } from "../application/location-handlers";
import type { ProjectStructureReader } from "../application/structure-read-model";
import { WingHandlers } from "../application/wing-handlers";
import type { StructureUsage } from "../domain/structure-repository";
import { PrismaLocationRepository } from "./prisma-location-repository";
import { PrismaPhaseRepository } from "./prisma-phase-repository";
import { PrismaProjectRepository } from "./prisma-project-repository";
import { PrismaProjectStructureReader } from "./prisma-project-structure-reader";
import { PrismaWingRepository } from "./prisma-wing-repository";
import { UnusedStructure } from "./unused-structure";

type Deps = {
  prisma?: PrismaClient;
  /** Who points at floors, units, Wings and Locations; nobody in M4. */
  usage?: StructureUsage;
  clock?: () => Date;
};

/**
 * The Project's structure as read models (CM-402, CM-405), by Company and
 * Project id with no visibility check: for the composition root's
 * `LocationResolver` and the location picker (CM-403).
 */
export function createProjectStructureReader(
  deps: Pick<Deps, "prisma"> = {},
): ProjectStructureReader {
  return new PrismaProjectStructureReader(deps.prisma ?? prisma);
}

/** Phases and Wings (CM-402). */
export function createWingHandlers(deps: Deps = {}): WingHandlers {
  const db = deps.prisma ?? prisma;
  return new WingHandlers(
    new PrismaProjectRepository(db),
    new PrismaPhaseRepository(db),
    new PrismaWingRepository(db),
    new PrismaProjectStructureReader(db),
    deps.usage ?? new UnusedStructure(),
    deps.clock,
  );
}

/** Locations (CM-405). */
export function createLocationHandlers(deps: Deps = {}): LocationHandlers {
  const db = deps.prisma ?? prisma;
  return new LocationHandlers(
    new PrismaProjectRepository(db),
    new PrismaLocationRepository(db),
    new PrismaProjectStructureReader(db),
    deps.usage ?? new UnusedStructure(),
    deps.clock,
  );
}
