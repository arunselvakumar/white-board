import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  toSalarySlipModel,
  type ListConstructionHrmsMySalariesResponseModel,
} from "../salary-models";
import { salaryHandlers } from "../salary-route";

export const dynamic = "force-dynamic";

/** My Salary (CM-317, `hrms.salaries` read): the caller's Approved and Paid slips and advances, newest month first, with amounts. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.salaries", "read");
    if (isResponse(session)) return session;
    const result = await salaryHandlers.mine(session.access);
    const body: ListConstructionHrmsMySalariesResponseModel = {
      member: result.member,
      items: result.records.map(toSalarySlipModel),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
