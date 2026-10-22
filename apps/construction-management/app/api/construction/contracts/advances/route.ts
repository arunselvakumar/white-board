import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  advanceHandlers,
  requestContract,
  requireContractAccess,
  respond,
} from "./advance-access";
import { CreateConstructionContractsAdvanceRequestModel } from "./advance-models";

export const dynamic = "force-dynamic";

/**
 * Records an advance (CM-1108): given to a Work Order's Contractor (Work
 * Order Update + Financial) or received from the Project's Client (Client
 * Bills Update + Financial), as an on-account finance payment in the same
 * transaction, which also needs finance Parties Create on the Project.
 * Answers the contract's advances and retention.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const contract = requestContract(body);
    const session = await requireContractAccess(request, "update", contract);
    if (isResponse(session)) return session;
    const input = parseOrThrow(
      CreateConstructionContractsAdvanceRequestModel.safeParse(body),
    );
    return respond(
      await advanceHandlers.recordAdvance(session.access, input),
      StatusCodes.CREATED,
    );
  } catch (error) {
    return mapError(error);
  }
}
