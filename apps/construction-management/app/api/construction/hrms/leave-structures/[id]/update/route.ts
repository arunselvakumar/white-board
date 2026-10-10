import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsLeaveIdParamsModel,
  leaveAccess,
  leaveHandlers,
} from "../../../leave-route";
import {
  toLeaveStructureResponse,
  UpdateConstructionHrmsLeaveStructureRequestModel,
} from "../../leave-structure-models";

export const dynamic = "force-dynamic";

/**
 * Replaces a structure's name and lines (CM-311). Balances already
 * initialised keep their opening credit; new entitlements apply to the
 * next initialisation and to monthly credits.
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
      flag: "update",
    });
    if (isResponse(session)) return session;
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionHrmsLeaveStructureRequestModel.safeParse(
        await request.json(),
      ),
    );
    const structure = await leaveHandlers.configuration.updateStructure(
      session.access,
      id,
      input,
      new Date(expectedUpdatedAt),
    );
    return Response.json(toLeaveStructureResponse(structure));
  } catch (error) {
    return mapError(error);
  }
}
