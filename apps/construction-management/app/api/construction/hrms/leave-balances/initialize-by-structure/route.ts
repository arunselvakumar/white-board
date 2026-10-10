import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  InitializeConstructionHrmsLeaveBalancesByStructureRequestModel,
  type InitializeConstructionHrmsLeaveBalancesResponseModel,
} from "../leave-balance-models";

export const dynamic = "force-dynamic";

/** Initialise every Team Member whose structure in force is this one (CM-311). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "update",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      InitializeConstructionHrmsLeaveBalancesByStructureRequestModel.safeParse(
        await request.json(),
      ),
    );
    const body: InitializeConstructionHrmsLeaveBalancesResponseModel =
      await leaveHandlers.balances.initialiseByStructure(session.access, model);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
