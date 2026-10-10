import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { ProjectDrawings } from "../application/project-drawings";
import { PrismaDrawingStore } from "./prisma-drawing-store";
import { PrismaProjectRepository } from "./prisma-project-repository";
import { PrismaUploaderNames } from "./prisma-uploader-names";

/** Project Drawings' composition (CM-408); the routes pass the plan. */
export function createProjectDrawings(deps: {
  plan: PlanGate;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): ProjectDrawings {
  const db = deps.prisma ?? prisma;
  return new ProjectDrawings(
    new PrismaProjectRepository(db),
    new PrismaDrawingStore(db),
    deps.storage ?? objectStorage(),
    deps.plan,
    new PrismaUploaderNames(db),
    deps.clock,
  );
}
