import { prisma, type PrismaClient } from "@repo/construction-db";

import type { EventDispatcher } from "@/src/shared-kernel/events";
import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { DocumentThread } from "../application/document-thread";
import { PrismaDocumentLocator } from "./document-locator";
import {
  PrismaDocumentAuthorNames,
  PrismaDocumentThreadStore,
} from "./document-thread-store";

/**
 * The documents' thread and files (M5). The plan comes from the
 * organization context and `media` is the Gallery's dispatcher
 * (`projectMediaDispatcher()`), so the routes pass both.
 */
export function createDocumentThread(deps: {
  plan: PlanGate;
  media: EventDispatcher;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): DocumentThread {
  const db = deps.prisma ?? prisma;
  return new DocumentThread(
    new PrismaDocumentLocator(db),
    new PrismaDocumentThreadStore(db),
    new PrismaDocumentAuthorNames(db),
    deps.storage ?? objectStorage(),
    deps.plan,
    deps.media,
    deps.clock,
  );
}
