import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PayConstructionHrmsAdvanceSalaryRequestModel,
  toSalarySlipModel,
  type ConstructionHrmsSalarySlipModel,
} from "../salary-models";
import { salaryHandlers } from "../salary-route";

export const dynamic = "force-dynamic";

/**
 * Pay Advance Salary (CM-316, ADR CM-0012 §15; `hrms.salaries` create and
 * financial): records the advance as a Paid advance slip. Later regular
 * slips recover it in `instalments`, starting the advance's month unless
 * that month is already approved. Not to oneself, except the Owner.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      PayConstructionHrmsAdvanceSalaryRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, "hrms.salaries", "create");
    if (isResponse(session)) return session;
    const body: ConstructionHrmsSalarySlipModel = toSalarySlipModel(
      await salaryHandlers.payAdvance(session.access, {
        memberId: model.memberId,
        amount: model.amount,
        instalments: model.instalments ?? null,
        advanceDate: model.advanceDate,
        mode: model.mode,
        reference: model.reference ?? null,
        reason: model.reason ?? null,
      }),
    );
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
