import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  PreviewConstructionHrmsLeaveRequestModel,
  toLeavePreviewResponse,
} from "../leave-models";

export const dynamic = "force-dynamic";

/**
 * The Apply Leave form's live view (CM-313): day breakdown, total and
 * balance, and why applying would be refused. Writes nothing.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "create",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      PreviewConstructionHrmsLeaveRequestModel.safeParse(await request.json()),
    );
    return Response.json(
      toLeavePreviewResponse(
        await leaveHandlers.requests.preview(session.access, model),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
