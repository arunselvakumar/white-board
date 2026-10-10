import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  HrmsBranchIdParamsModel,
  UpdateConstructionHrmsBranchRequestModel,
  toBranchResponse,
} from "../../branch-models";
import { branches } from "../../handlers";

export const dynamic = "force-dynamic";

/** Edits a branch or site fence; 409 `BRANCH_CHANGED` when stale (CM-304). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.settings", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      HrmsBranchIdParamsModel.safeParse(await context.params),
    );
    const { expectedUpdatedAt, ...branch } = parseOrThrow(
      UpdateConstructionHrmsBranchRequestModel.safeParse(await request.json()),
    );
    const updated = await branches.update({
      access: session.access,
      id,
      branch,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toBranchResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
