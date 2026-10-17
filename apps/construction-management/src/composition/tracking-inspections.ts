import { prisma } from "@repo/construction-db";

import { createProjectLocations } from "@/src/composition/location-resolver";
import { projectMediaDispatcher } from "@/src/composition/project-media-listeners";
import { trackingDirectory } from "@/src/composition/tracking-directory";
import { trackingDrawingLinks } from "@/src/composition/tracking-drawing-links";
import { companyToday } from "@/src/shared-kernel/company-today";
import { messagingEvents } from "@/src/composition/messaging";
import { InspectionHandlers } from "@/src/tracking/application/inspection-handlers";
import {
  attachEntryFiles,
  entryFiles,
  tombstoneEntryFiles,
} from "@/src/tracking/infrastructure/entry-files";
import { insertIssueRow } from "@/src/tracking/infrastructure/issue-rows";
import { PrismaInspectionStore } from "@/src/tracking/infrastructure/prisma-inspection-store";
import { loadBackdatedCheck } from "@/src/tracking/infrastructure/tracking-guards";

/**
 * Inspection Request handlers (CM-804) wired to Prisma, the
 * `TrackingDirectory`, the Project's LocationResolver and the shared Issue
 * & Snag writer (snags from a rejection). `InspectionRequested` and
 * `InspectionDecided` reach messaging's notifications (CM-904).
 */
export function createInspectionHandlers(): InspectionHandlers {
  return new InspectionHandlers({
    db: prisma,
    store: new PrismaInspectionStore(),
    directory: trackingDirectory,
    drawingLinks: trackingDrawingLinks,
    locations: createProjectLocations(),
    backdated: (actor) => loadBackdatedCheck(prisma, actor),
    today: (workspaceId) => companyToday(prisma, workspaceId),
    raiseSnag: insertIssueRow,
    events: messagingEvents(),
    files: {
      attach: (tx, input) =>
        attachEntryFiles(tx, {
          workspaceId: input.workspaceId,
          type: "inspection",
          documentId: input.inspectionId,
          entryId: input.observationId,
          fileIds: input.fileIds,
          by: input.by,
        }),
      tombstone: (tx, input) =>
        tombstoneEntryFiles(tx, {
          workspaceId: input.workspaceId,
          type: "inspection",
          documentId: input.inspectionId,
          entryId: input.observationId,
          by: input.by,
          at: input.at,
        }),
      ofObservations: (db, input) =>
        entryFiles(db, {
          workspaceId: input.workspaceId,
          type: "inspection",
          documentId: input.inspectionId,
          entryIds: input.observationIds,
        }),
    },
    media: projectMediaDispatcher(),
  });
}
