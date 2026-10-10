import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  CalculateConstructionHrmsSalariesRequestModel,
  toCalculateModel,
  type CalculateConstructionHrmsSalariesResponseModel,
} from "../salary-models";
import { salaryHandlers } from "../salary-route";

export const dynamic = "force-dynamic";

/**
 * Calculate Salary (CM-316, `hrms.salaries` create) for a month that has
 * started: every live member, or `memberIds`. Calculated slips are
 * replaced, Approved and Paid ones kept; members not joined or not
 * Configured are listed in `skipped` with the reason.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CalculateConstructionHrmsSalariesRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, "hrms.salaries", "create");
    if (isResponse(session)) return session;
    const body: CalculateConstructionHrmsSalariesResponseModel =
      toCalculateModel(
        await salaryHandlers.calculate(session.access, {
          month: model.month,
          memberIds: model.memberIds ?? null,
        }),
      );
    return Response.json(body, { status: StatusCodes.OK });
  } catch (error) {
    return mapError(error);
  }
}
