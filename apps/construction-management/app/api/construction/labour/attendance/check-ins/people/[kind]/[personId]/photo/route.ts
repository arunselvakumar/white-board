import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { imageResponse } from "@/app/api/_lib/uploads";

import {
  ConstructionLabourCheckInPersonPhotoParamsModel,
  ListConstructionLabourCheckInPeopleRequestModel,
} from "../../../../check-in-models";
import { checkInHandlers as handlers } from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * The photo on a Labour's or Vendor's record, for the capture screen: for
 * a member with Attendance read on the Project, of someone on it. 404
 * `PHOTO_NOT_FOUND` when there is none, and always for a Site Engineer.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string; personId: string }> },
): Promise<Response> {
  try {
    const { kind, personId } = parseOrThrow(
      ConstructionLabourCheckInPersonPhotoParamsModel.safeParse(
        await context.params,
      ),
    );
    const { projectId } = parseOrThrow(
      ListConstructionLabourCheckInPeopleRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId,
    });
    if (isResponse(session)) return session;
    return imageResponse(
      await handlers.recordPhoto(
        session.workspaceId,
        projectId,
        kind,
        personId,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
