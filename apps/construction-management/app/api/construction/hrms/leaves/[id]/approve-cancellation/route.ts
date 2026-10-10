import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../../leave-route";
import {
  ApproveConstructionHrmsLeaveRequestModel,
  toLeaveRequestResponse,
} from "../../leave-models";

export const dynamic = "force-dynamic";

/** Approve a cancellation request (CM-312): the leave is cancelled and its days restored. */
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
      flag: "approve",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ApproveConstructionHrmsLeaveRequestModel.safeParse(await request.json()),
    );
    const updated = await leaveHandlers.requests.decideCancellation(
      session.access,
      id,
      { approve: true, remarks: model.remarks },
      new Date(model.expectedUpdatedAt),
    );
    return Response.json(toLeaveRequestResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
