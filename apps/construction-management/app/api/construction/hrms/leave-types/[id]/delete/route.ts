import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveExpectedUpdatedAtRequestModel,
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../../leave-route";

export const dynamic = "force-dynamic";

/**
 * Deletes a leave type nobody uses (CM-310); one in a structure, a balance
 * or a request is 409 `LEAVE_TYPE_IN_USE` — deactivate it instead.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionHrmsLeaveIdParamsModel.safeParse(await context.params),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "delete",
    });
    if (isResponse(session)) return session;
    const { expectedUpdatedAt } = parseOrThrow(
      ConstructionHrmsLeaveExpectedUpdatedAtRequestModel.safeParse(
        await request.json(),
      ),
    );
    await leaveHandlers.configuration.deleteType(
      session.access,
      id,
      new Date(expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
