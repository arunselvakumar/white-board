import { prisma, type PrismaClient } from "@repo/construction-db";

import type { EventDispatcher } from "@/src/shared-kernel/events";
import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { SiteWorkDocumentThread } from "../application/document-thread";
import type { SiteWorkAuthorNames } from "../application/document-thread-ports";
import { PrismaSiteWorkDocumentLocator } from "./document-locator";
import { PrismaSiteWorkDocumentThreadStore } from "./document-thread-store";

/**
 * The site-work documents' thread and files (CM-0016 §8). The plan comes
 * from the organization context, `media` is the Gallery's dispatcher
 * (`projectMediaDispatcher()`) and `names` the Team Members' names
 * (`siteWorkAuthorNames()`), so the routes pass all three.
 */
export function createSiteWorkDocumentThread(deps: {
  plan: PlanGate;
  media: EventDispatcher;
  names: SiteWorkAuthorNames;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): SiteWorkDocumentThread {
  const db = deps.prisma ?? prisma;
  return new SiteWorkDocumentThread(
    new PrismaSiteWorkDocumentLocator(db),
    new PrismaSiteWorkDocumentThreadStore(db),
    deps.names,
    deps.storage ?? objectStorage(),
    deps.plan,
    deps.media,
    deps.clock,
  );
}
