import { prisma, type PrismaClient } from "@repo/construction-db";

import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import {
  SalesDocumentFiles,
  type SalesFilePeople,
} from "../application/document-files";
import type { SalesDirectory } from "../application/ports";
import { PrismaSalesDocumentFileStore } from "./document-files-store";
import { PrismaSalesDocumentLocator } from "./document-locator";

/**
 * The inquiries' and bookings' files (CM-1003). The plan comes from the
 * organization context and `directory` is the `SalesDirectory`, which
 * names uploaders and finds the viewer's Team Member for View all.
 */
export function createSalesDocumentFiles(deps: {
  plan: PlanGate;
  directory: SalesDirectory;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): SalesDocumentFiles {
  const db = deps.prisma ?? prisma;
  const people: SalesFilePeople = {
    async memberIdOfUser(workspaceId, userId, projectId) {
      return (
        (await deps.directory.memberOfUser(db, workspaceId, userId, projectId))
          ?.id ?? null
      );
    },
    namesOf(workspaceId, userIds) {
      if (userIds.length === 0) return Promise.resolve(new Map());
      return deps.directory.userNames(db, workspaceId, userIds);
    },
  };
  return new SalesDocumentFiles(
    new PrismaSalesDocumentLocator(db),
    new PrismaSalesDocumentFileStore(db),
    people,
    deps.storage ?? objectStorage(),
    deps.plan,
    deps.clock,
  );
}
