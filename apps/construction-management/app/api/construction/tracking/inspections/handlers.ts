import { requireTrackingRecordAccess } from "@/app/api/construction/tracking/tracking-access";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { createInspectionHandlers } from "@/src/composition/tracking-inspections";
import type { Flag } from "@/src/shared-kernel/access";
import {
  inspectionActions,
  type InspectionReadModel,
  type StoredInspection,
} from "@/src/tracking/application/inspection-handlers";
import { TRACKING_DOCUMENTS } from "@/src/tracking/domain/tracking-documents";

import { toInspectionResponse } from "./inspection-models";

export const INSPECTION_MENU = TRACKING_DOCUMENTS.inspection.menu;

/** One set of Inspection Request handlers for every route (CM-804). */
export const inspectionHandlers = createInspectionHandlers();

/**
 * The Session plus the Permission Matrix check for a route about one
 * request: it is loaded first (404 `INSPECTION_NOT_FOUND` for another
 * Company's or a deleted one), then `flags` are checked on its Project.
 */
export function requireInspectionAccess(
  request: Request,
  id: string,
  flags: Flag | readonly [Flag, ...Flag[]],
): Promise<(AccessSession & { target: StoredInspection }) | Response> {
  return requireTrackingRecordAccess(request, INSPECTION_MENU, flags, (ws) =>
    inspectionHandlers.find(ws, id),
  );
}

/** Read models with the viewer's actions, for list and detail responses. */
export async function inspectionResponses(
  session: AccessSession,
  rows: readonly InspectionReadModel[],
) {
  const viewer = await inspectionHandlers.viewer(session.access);
  return rows.map((row) =>
    toInspectionResponse(
      row,
      inspectionActions(viewer, row, row.reinspections.length > 0),
    ),
  );
}

/** One request as the viewer sees it. */
export async function inspectionResponse(session: AccessSession, id: string) {
  const row = await inspectionHandlers.get(session.workspaceId, id);
  const [body] = await inspectionResponses(session, [row]);
  return body;
}
