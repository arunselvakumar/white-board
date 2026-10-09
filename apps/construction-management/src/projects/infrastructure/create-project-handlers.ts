import { prisma, type PrismaClient } from "@repo/db";

import type { PlanGate } from "@/src/shared-kernel/plan";

import { ProjectHandlers } from "../application/project-handlers";
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
    deps.clock,
  );
}
