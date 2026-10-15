import { prisma, type PrismaClient } from "@repo/construction-db";

import type { EventDispatcher } from "@/src/shared-kernel/events";
import type { ObjectStorage } from "@/src/shared-kernel/files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { PlanGate } from "@/src/shared-kernel/plan";

import { TrackingDocumentFiles } from "../application/document-files";
import type { TrackingFilePeople } from "../application/document-files-ports";
import type { TrackingDirectory } from "../application/ports";
import { PrismaTrackingDocumentLocator } from "./document-locator";
import { PrismaTrackingDocumentFileStore } from "./document-files-store";

/**
 * The tracking documents' files (CM-0019 §11). The plan comes from the
 * organization context, `media` is the Gallery's dispatcher
 * (`projectMediaDispatcher()`) and `directory` the `TrackingDirectory`
 * (`trackingDirectory`), which names uploaders and finds the viewer's Team
 * Member for View all scoping; the routes pass all three.
 */
export function createTrackingDocumentFiles(deps: {
  plan: PlanGate;
  media: EventDispatcher;
  directory: TrackingDirectory;
  prisma?: PrismaClient;
  storage?: ObjectStorage;
  clock?: () => Date;
}): TrackingDocumentFiles {
  const db = deps.prisma ?? prisma;
  const people: TrackingFilePeople = {
    async memberIdOfUser(workspaceId, userId) {
      return (
        (await deps.directory.memberOfUser(db, workspaceId, userId))?.id ?? null
      );
    },
    async namesOf(workspaceId, userIds) {
      if (userIds.length === 0) return new Map();
      return (await deps.directory.names(db, workspaceId, { userIds })).users;
    },
  };
  return new TrackingDocumentFiles(
    new PrismaTrackingDocumentLocator(db),
    new PrismaTrackingDocumentFileStore(db),
    people,
    deps.storage ?? objectStorage(),
    deps.plan,
    deps.media,
    deps.clock,
  );
}
