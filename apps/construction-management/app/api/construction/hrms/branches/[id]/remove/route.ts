import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { HrmsBranchIdParamsModel } from "../../branch-models";
import { branches } from "../../handlers";

export const dynamic = "force-dynamic";

/** Removes a fence ("Remove Fence"); its member links go with it (CM-304). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.settings", "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      HrmsBranchIdParamsModel.safeParse(await context.params),
    );
    await branches.remove({ access: session.access, id });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
