import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveExpectedUpdatedAtRequestModel,
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../../leave-route";
import { toLeaveTypeResponse } from "../../leave-type-models";

export const dynamic = "force-dynamic";

/** Offers the leave type again (CM-310). */
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
      flag: "update",
    });
    if (isResponse(session)) return session;
    const { expectedUpdatedAt } = parseOrThrow(
      ConstructionHrmsLeaveExpectedUpdatedAtRequestModel.safeParse(
        await request.json(),
      ),
    );
    const type = await leaveHandlers.configuration.setTypeActive(
      session.access,
      id,
      true,
      new Date(expectedUpdatedAt),
    );
    return Response.json(toLeaveTypeResponse(type));
  } catch (error) {
    return mapError(error);
  }
}
