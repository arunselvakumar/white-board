import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";

import { ownershipHandlers } from "../handlers";
import type { ListConstructionOrganizationOwnershipCandidatesResponseModel } from "../ownership-models";

export const dynamic = "force-dynamic";

/** The Team Members the Owner may hand the Company to, by name. Owner only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const body: ListConstructionOrganizationOwnershipCandidatesResponseModel = {
      items: await ownershipHandlers.candidates(session.workspaceId),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
