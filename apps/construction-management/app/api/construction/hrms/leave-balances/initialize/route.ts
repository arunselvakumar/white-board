import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  InitializeConstructionHrmsLeaveBalancesRequestModel,
  type InitializeConstructionHrmsLeaveBalancesResponseModel,
} from "../leave-balance-models";

export const dynamic = "force-dynamic";

/**
 * Opens a leave year's balances for Team Members (CM-311): upfront types
 * get their entitlement, monthly types start at 0, and unused days carry
 * forward when both switches allow. Running it again opens nothing twice.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "update",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      InitializeConstructionHrmsLeaveBalancesRequestModel.safeParse(
        await request.json(),
      ),
    );
    const body: InitializeConstructionHrmsLeaveBalancesResponseModel =
      await leaveHandlers.balances.initialise(session.access, model);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
