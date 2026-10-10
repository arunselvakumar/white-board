import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { ProjectTestingReports } from "../application/project-testing-reports";
import { PrismaProjectRepository } from "./prisma-project-repository";
import {
  PrismaTestingReportBackdatedGuard,
  PrismaTestingReportStore,
} from "./prisma-testing-report-store";
import { PrismaUploaderNames } from "./prisma-uploader-names";

/** Testing Reports' composition (CM-409); the routes pass the plan. */
export function createProjectTestingReports(deps: {
  plan: PlanGate;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): ProjectTestingReports {
  const db = deps.prisma ?? prisma;
  return new ProjectTestingReports(
    new PrismaProjectRepository(db),
    new PrismaTestingReportStore(db),
    deps.storage ?? objectStorage(),
    deps.plan,
    new PrismaUploaderNames(db),
    new PrismaTestingReportBackdatedGuard(db),
    deps.clock,
  );
}
