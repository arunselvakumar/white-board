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

/** Deletes a structure nobody is assigned (409 `LEAVE_STRUCTURE_IN_USE` otherwise). */
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
    await leaveHandlers.configuration.deleteStructure(
      session.access,
      id,
      new Date(expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
