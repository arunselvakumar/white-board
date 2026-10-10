import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../../leave-route";
import {
  toLeaveTypeResponse,
  UpdateConstructionHrmsLeaveTypeRequestModel,
} from "../../leave-type-models";

export const dynamic = "force-dynamic";

/** Replaces a leave type's settings (CM-310); its active state is kept. */
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
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionHrmsLeaveTypeRequestModel.safeParse(
        await request.json(),
      ),
    );
    const type = await leaveHandlers.configuration.updateType(
      session.access,
      id,
      input,
      new Date(expectedUpdatedAt),
    );
    return Response.json(toLeaveTypeResponse(type));
  } catch (error) {
    return mapError(error);
  }
}
