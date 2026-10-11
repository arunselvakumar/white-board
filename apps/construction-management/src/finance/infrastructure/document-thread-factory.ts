import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { FinanceDocumentThread } from "../application/document-thread";
import type { FinanceAuthorNames } from "../application/document-thread-ports";
import type { FinanceDirectory } from "../application/ports";
import { PrismaFinanceDocumentLocator } from "./document-locator";
import { PrismaFinanceDocumentThreadStore } from "./document-thread-store";

/**
 * The finance documents' thread and files (ADR CM-0017). The plan comes
 * from the organization context, `names` are the Team Members' names
 * (`financeAuthorNames()`) and `directory` the finance directory (a
 * voucher holder's User), so the routes pass all three. There is no
 * Gallery dispatcher: finance files never join the Project Gallery.
 */
export function createFinanceDocumentThread(deps: {
  plan: PlanGate;
  names: FinanceAuthorNames;
  directory: Pick<FinanceDirectory, "teamMembers">;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): FinanceDocumentThread {
  const db = deps.prisma ?? prisma;
  return new FinanceDocumentThread(
    new PrismaFinanceDocumentLocator(db, deps.directory),
    new PrismaFinanceDocumentThreadStore(db),
    deps.names,
    deps.storage ?? objectStorage(),
    deps.plan,
    deps.clock,
  );
}
