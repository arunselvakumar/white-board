import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../../leave-route";
import {
  WithdrawConstructionHrmsLeaveRequestModel,
  toLeaveRequestResponse,
} from "../../leave-models";

export const dynamic = "force-dynamic";

/** Withdraw a pending request (CM-312, ADR CM-0012 §8): the reserved days are released. */
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
      WithdrawConstructionHrmsLeaveRequestModel.safeParse(await request.json()),
    );
    const updated = await leaveHandlers.requests.withdraw(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return Response.json(toLeaveRequestResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
