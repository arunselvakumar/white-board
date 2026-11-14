import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ListConstructionLabourCheckInPeopleRequestModel,
  type ListConstructionLabourCheckInPeopleResponseModel,
} from "../check-in-models";
import {
  checkInHandlers as handlers,
  toContextResponse,
  toPersonResponse,
  viewerOf,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The find screen: the Project's Site Engineers, the Labours on it today
 * and the Vendors assigned to it, each group by name, with where each
 * person stands today, the server's time and the Site fence. Needs
 * Attendance read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionLabourCheckInPeopleRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const people = await handlers.people(
      session.workspaceId,
      model.projectId,
      viewerOf(session.access, model.projectId),
    );
    const body: ListConstructionLabourCheckInPeopleResponseModel = {
      ...toContextResponse(people),
      siteEngineers: people.siteEngineers.map(toPersonResponse),
      labours: people.labours.map(toPersonResponse),
      vendors: people.vendors.map(toPersonResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
