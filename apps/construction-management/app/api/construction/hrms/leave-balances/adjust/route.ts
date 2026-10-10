import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  AdjustConstructionHrmsLeaveBalanceRequestModel,
  toBalanceRow,
} from "../leave-balance-models";

export const dynamic = "force-dynamic";

/**
 * A manager's balance adjustment with a reason (CM-311, ADR CM-0012 §9):
 * credit Compensatory Off, or correct a balance. A debit may not take it
 * below zero (`LEAVE_ADJUSTMENT_BELOW_ZERO`).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "update",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      AdjustConstructionHrmsLeaveBalanceRequestModel.safeParse(
        await request.json(),
      ),
    );
    const row = await leaveHandlers.balances.adjust(session.access, model);
    return Response.json(toBalanceRow(row));
  } catch (error) {
    return mapError(error);
  }
}
