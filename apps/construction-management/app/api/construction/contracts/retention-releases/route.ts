import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  advanceHandlers,
  requestContract,
  requireContractAccess,
  respond,
} from "../advances/advance-access";
import { CreateConstructionContractsRetentionReleaseRequestModel } from "../advances/advance-models";

export const dynamic = "force-dynamic";

/**
 * Releases retention on a Work Order or the client contract (CM-1108;
 * Update + Financial on the side's menu, Approve for a DLP-end release
 * before the DLP ends): on completion, at the DLP end, against a live
 * retention bank guarantee, or for another reason, up to what is
 * releasable. Creates the finance invoice (origin `retention_release`):
 * payable to the Contractor, or receivable from the Client.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const contract = requestContract(body);
    const session = await requireContractAccess(request, "update", contract);
    if (isResponse(session)) return session;
    const input = parseOrThrow(
      CreateConstructionContractsRetentionReleaseRequestModel.safeParse(body),
    );
    return respond(
      await advanceHandlers.release(session.access, input),
      StatusCodes.CREATED,
    );
  } catch (error) {
    return mapError(error);
  }
}
