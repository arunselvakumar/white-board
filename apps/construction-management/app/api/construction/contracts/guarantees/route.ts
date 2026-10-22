import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  advanceHandlers,
  requestContract,
  requireContractAccess,
  respond,
} from "../advances/advance-access";
import { CreateConstructionContractsBankGuaranteeRequestModel } from "../advances/advance-models";

export const dynamic = "force-dynamic";

/**
 * Adds a bank guarantee to a Work Order or the client contract (CM-1108;
 * Update + Financial on the side's menu): for an advance (naming it),
 * retention or performance.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const contract = requestContract(body);
    const session = await requireContractAccess(request, "update", contract);
    if (isResponse(session)) return session;
    const input = parseOrThrow(
      CreateConstructionContractsBankGuaranteeRequestModel.safeParse(body),
    );
    return respond(
      await advanceHandlers.addGuarantee(session.access, input),
      StatusCodes.CREATED,
    );
  } catch (error) {
    return mapError(error);
  }
}
