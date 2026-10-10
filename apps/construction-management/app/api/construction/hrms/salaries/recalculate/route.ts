import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  RecalculateConstructionHrmsSalaryRequestModel,
  toSalarySlipModel,
  type ConstructionHrmsSalarySlipModel,
} from "../salary-models";
import { salaryHandlers } from "../salary-route";

export const dynamic = "force-dynamic";

/**
 * Recalculate one Calculated salary (CM-316, `hrms.salaries` create) from
 * today's attendance, leave and statutory figures. An Approved or Paid
 * slip is 409 `SALARY_SLIP_NOT_CALCULATED`; a stale `expectedUpdatedAt`
 * is 409 `SALARY_SLIP_CHANGED`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      RecalculateConstructionHrmsSalaryRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, "hrms.salaries", "create");
    if (isResponse(session)) return session;
    const body: ConstructionHrmsSalarySlipModel = toSalarySlipModel(
      await salaryHandlers.recalculate(session.access, {
        id: model.id,
        expectedUpdatedAt: new Date(model.expectedUpdatedAt),
      }),
    );
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
