import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionHrmsSalaryIdParamsModel,
  toSalarySlipModel,
  type ConstructionHrmsSalarySlipModel,
} from "../salary-models";
import { salaryHandlers } from "../salary-route";

export const dynamic = "force-dynamic";

/** One salary slip (`hrms.salaries` read): one's own once approved, anyone's with view_all; others' amounts need financial. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionHrmsSalaryIdParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, "hrms.salaries", "read");
    if (isResponse(session)) return session;
    const body: ConstructionHrmsSalarySlipModel = toSalarySlipModel(
      await salaryHandlers.detail(session.access, id),
    );
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
