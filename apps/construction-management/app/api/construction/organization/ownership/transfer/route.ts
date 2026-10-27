import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";

import { ownershipHandlers } from "../handlers";
import {
  TransferConstructionOrganizationOwnershipRequestModel,
  type TransferConstructionOrganizationOwnershipResponseModel,
} from "../ownership-models";

export const dynamic = "force-dynamic";

/**
 * Hands the Company to another Team Member (Owner only, with a
 * `transfer_ownership` code). They become `owner`; the caller becomes a
 * `member` on the Admin Role. Audited as `company.ownership_transferred`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      TransferConstructionOrganizationOwnershipRequestModel.safeParse(
        await request.json(),
      ),
    );
    const result: TransferConstructionOrganizationOwnershipResponseModel =
      await ownershipHandlers.transfer({
        workspaceId: session.workspaceId,
        by: session.userId,
        sessionId: session.sessionId,
        memberId: body.memberId,
        code: body.code,
      });
    return Response.json(result);
  } catch (error) {
    return mapError(error);
  }
}
