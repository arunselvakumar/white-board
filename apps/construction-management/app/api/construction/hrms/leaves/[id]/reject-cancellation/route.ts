import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../../leave-route";
import {
  RejectConstructionHrmsLeaveRequestModel,
  toLeaveRequestResponse,
} from "../../leave-models";

export const dynamic = "force-dynamic";

/** Refuse a cancellation request with a reason (CM-312): the leave stays approved. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionHrmsLeaveIdParamsModel.safeParse(await context.params),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "reject",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RejectConstructionHrmsLeaveRequestModel.safeParse(await request.json()),
    );
    const updated = await leaveHandlers.requests.decideCancellation(
      session.access,
      id,
      { approve: false, remarks: model.reason },
      new Date(model.expectedUpdatedAt),
    );
    return Response.json(toLeaveRequestResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
