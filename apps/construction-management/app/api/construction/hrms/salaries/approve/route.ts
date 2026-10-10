import { after } from "next/server";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ApproveConstructionHrmsSalariesRequestModel,
  toSalarySlipModel,
  type ConstructionHrmsSalarySlipsResponseModel,
} from "../salary-models";
import { salaryHandlers } from "../salary-route";

export const dynamic = "force-dynamic";

/**
 * Approve salaries (CM-316, `hrms.salaries` approve), all or none: each a
 * Calculated slip still as loaded. Nobody approves their own salary
 * except the Owner (403 `SALARY_OWN_SLIP`); an approved slip is 409
 * `SALARY_SLIP_ALREADY_APPROVED`. Approval locks each member's month for
 * attendance and leave (ADR CM-0012 §17); the payslips are stored after
 * the response.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ApproveConstructionHrmsSalariesRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, "hrms.salaries", "approve");
    if (isResponse(session)) return session;
    const records = await salaryHandlers.approve(session.access, {
      slips: model.slips.map((item) => ({
        id: item.id,
        expectedUpdatedAt: new Date(item.expectedUpdatedAt),
      })),
    });
    const { workspaceId, userId } = session.access;
    try {
      after(() =>
        salaryHandlers.storePayslips(
          workspaceId,
          records.map((record) => record.slip.id),
          userId,
        ),
      );
    } catch {
      // Outside a request scope (tests): the first download stores them.
    }
    const body: ConstructionHrmsSalarySlipsResponseModel = {
      items: records.map(toSalarySlipModel),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
