import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  HrmsBranchIdParamsModel,
  SetConstructionHrmsBranchMembersRequestModel,
  toBranchResponse,
} from "../../branch-models";
import { branches } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * "Members who check in here": replaces the Team Members linked to an
 * office branch (CM-304, ADR CM-0012 §4).
 */
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
    const model = parseOrThrow(
      SetConstructionHrmsBranchMembersRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await branches.setMembers({
      access: session.access,
      id,
      memberIds: model.memberIds,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(toBranchResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
