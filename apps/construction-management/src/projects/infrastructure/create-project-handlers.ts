import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { ProjectHandlers } from "../application/project-handlers";
import { ProjectHomeHandlers } from "../application/project-home-handlers";
import { ProjectLogos } from "../application/project-logos";
import { PrismaCustomFieldLabels } from "./prisma-custom-field-labels";
import {
  PrismaProjectCounts,
  PrismaProjectPreferences,
} from "./prisma-project-preferences";
import { PrismaProjectRepository } from "./prisma-project-repository";
import { PrismaProjectUsage } from "./prisma-project-usage";

/**
 * The projects context's composition. The plan limits come from the
 * organization context, so the caller (the routes) passes its `PlanGate`.
 */
export function createProjectHandlers(deps: {
  plan: PlanGate;
  prisma?: PrismaClient;
  clock?: () => Date;
}) {
  const db = deps.prisma ?? prisma;
  return new ProjectHandlers(
    new PrismaProjectRepository(db),
    deps.plan,
    new PrismaProjectUsage(db),
    new PrismaCustomFieldLabels(db),
    deps.clock,
  );
}

/** The Project logo's composition (CM-401); storage counts against the plan. */
export function createProjectLogos(deps: {
  plan: PlanGate;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): ProjectLogos {
  return new ProjectLogos(
    new PrismaProjectRepository(deps.prisma ?? prisma),
    deps.storage ?? objectStorage(),
    deps.plan,
    deps.clock,
  );
}

/** The Project home, member preferences and dashboard summary (CM-411, CM-412). */
export function createProjectHomeHandlers(deps?: {
  prisma?: PrismaClient;
  clock?: () => Date;
}): ProjectHomeHandlers {
  const db = deps?.prisma ?? prisma;
  return new ProjectHomeHandlers(
    new PrismaProjectRepository(db),
    new PrismaProjectPreferences(db),
    new PrismaProjectCounts(db),
    deps?.clock,
  );
}
