import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ListConstructionHrmsTeamSalariesQueryModel,
  toTeamModel,
  type ListConstructionHrmsTeamSalariesResponseModel,
} from "./salary-models";
import { queryOf, salaryHandlers } from "./salary-route";

export const dynamic = "force-dynamic";

/**
 * Team Salary for a month (CM-317, `hrms.salaries` read and view_all):
 * every slip (regular and advance), the members without a slip and why,
 * the month's totals (64-bit sums; null without financial) and what the
 * caller may do. Amounts of others' slips are null without financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ListConstructionHrmsTeamSalariesQueryModel.safeParse(queryOf(request)),
    );
    const session = await requireAccess(request, "hrms.salaries", "read");
    if (isResponse(session)) return session;
    const body: ListConstructionHrmsTeamSalariesResponseModel = toTeamModel(
      await salaryHandlers.team(session.access, query.month),
    );
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
