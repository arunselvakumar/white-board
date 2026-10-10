import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../../leave-route";
import {
  RequestConstructionHrmsLeaveCancellationRequestModel,
  toLeaveRequestResponse,
} from "../../leave-models";

export const dynamic = "force-dynamic";

/** Ask to cancel approved leave with a reason (CM-312); the balance is restored once an approver agrees. */
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
      flag: "create",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RequestConstructionHrmsLeaveCancellationRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await leaveHandlers.requests.requestCancellation(
      session.access,
      id,
      model.reason,
      new Date(model.expectedUpdatedAt),
    );
    return Response.json(toLeaveRequestResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
