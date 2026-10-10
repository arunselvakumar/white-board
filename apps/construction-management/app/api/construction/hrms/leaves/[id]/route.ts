import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../leave-route";
import { toLeaveRequestResponse } from "../leave-models";

export const dynamic = "force-dynamic";

/** Leave Details (CM-313): your own request, or any with View All or as an approver. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionHrmsLeaveIdParamsModel.safeParse(await context.params),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "read",
    });
    if (isResponse(session)) return session;
    return Response.json(
      toLeaveRequestResponse(
        await leaveHandlers.requests.get(session.access, id),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
