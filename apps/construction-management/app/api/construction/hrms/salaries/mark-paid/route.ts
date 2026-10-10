import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  MarkConstructionHrmsSalariesPaidRequestModel,
  toSalarySlipModel,
  type ConstructionHrmsSalarySlipsResponseModel,
} from "../salary-models";
import { salaryHandlers } from "../salary-route";

export const dynamic = "force-dynamic";

/**
 * Mark Salaries as Paid (CM-316, `hrms.salaries` update), all or none:
 * Approved slips still as loaded, with the mode (Cash / Bank), the date
 * and a reference. Before approval it is 409 `SALARY_NOT_APPROVED`. It
 * does not post to company accounts (ADR CM-0012 §16).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      MarkConstructionHrmsSalariesPaidRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, "hrms.salaries", "update");
    if (isResponse(session)) return session;
    const records = await salaryHandlers.markPaid(session.access, {
      slips: model.slips.map((item) => ({
        id: item.id,
        expectedUpdatedAt: new Date(item.expectedUpdatedAt),
      })),
      mode: model.mode,
      paymentDate: model.paymentDate,
      reference: model.reference ?? null,
    });
    const body: ConstructionHrmsSalarySlipsResponseModel = {
      items: records.map(toSalarySlipModel),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
