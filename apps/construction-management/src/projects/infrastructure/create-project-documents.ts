import { prisma, type PrismaClient } from "@repo/db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { ProjectDocuments } from "../application/project-documents";
import { PrismaProjectDocumentStore } from "./prisma-project-document-store";
import { PrismaProjectRepository } from "./prisma-project-repository";
import { PrismaUploaderNames } from "./prisma-uploader-names";

/**
 * Project documents' composition (CM-414). Storage limits come from the
 * organization context's plan, so the caller (the routes) passes its
 * `PlanGate`.
 */
export function createProjectDocuments(deps: {
  plan: PlanGate;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): ProjectDocuments {
  const db = deps.prisma ?? prisma;
  return new ProjectDocuments(
    new PrismaProjectRepository(db),
    new PrismaProjectDocumentStore(db),
    deps.storage ?? objectStorage(),
    deps.plan,
    new PrismaUploaderNames(db),
    deps.clock,
  );
}
