import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../leave-route";
import { toLeaveTypeResponse } from "../leave-type-models";

export const dynamic = "force-dynamic";

/** One leave type (CM-310). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionHrmsLeaveIdParamsModel.safeParse(await context.params),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "read",
    });
    if (isResponse(session)) return session;
    return Response.json(
      toLeaveTypeResponse(
        await leaveHandlers.configuration.getType(session.access, id),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
