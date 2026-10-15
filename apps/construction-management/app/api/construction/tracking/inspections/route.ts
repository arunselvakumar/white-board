import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  INSPECTION_MENU,
  inspectionHandlers as handlers,
  inspectionResponse,
  inspectionResponses,
} from "./handlers";
import {
  CreateConstructionTrackingInspectionRequestModel,
  ListConstructionTrackingInspectionsRequestModel,
  type ListConstructionTrackingInspectionsResponse,
} from "./inspection-models";

export const dynamic = "force-dynamic";

/**
 * A Project's Inspection Requests, newest first, by status, Department,
 * Contractor, inspector, location, Inspection Date range and a search on
 * the Request No or description (CM-804), with the counts by status.
 * Needs Inspection Request read on the Project (no View-all scoping).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireTrackingProjectAccess(
      request,
      INSPECTION_MENU,
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionTrackingInspectionsRequestModel.safeParse(query),
    );
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      status: model.status,
      departmentId: model.departmentId,
      contractorId: model.contractorId,
      inspectorMemberId: model.inspectorMemberId,
      location:
        model.locationType == null || model.locationId == null
          ? undefined
          : { type: model.locationType, id: model.locationId },
      from: model.from,
      to: model.to,
      search: model.search,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionTrackingInspectionsResponse = {
      items: await inspectionResponses(session, page.items),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      counts: page.counts,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Raises an Inspection Request (CM-804), numbered from the
 * InspectionRequest rule (the Project's own if it has one) on its
 * Inspection Date, which the back-dated limit applies to. With
 * `reinspectionOfId` it is **Raise re-inspection** of a rejected request.
 * Needs Inspection Request create on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireTrackingProjectAccess(
      request,
      INSPECTION_MENU,
      "create",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionTrackingInspectionRequestModel.safeParse(raw),
    );
    const id = await handlers.create(session.access, model);
    return Response.json(await inspectionResponse(session, id), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
