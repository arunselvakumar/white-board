import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createSalaryStructureHandlers } from "@/src/hrms/infrastructure/create-salary-handlers";

import {
  ConstructionHrmsSalaryStructureParamsModel,
  toSalaryStructureResponse,
  UpdateConstructionHrmsSalaryStructureRequestModel,
} from "../../salary-structure-models";

export const dynamic = "force-dynamic";

const handlers = createSalaryStructureHandlers();

/**
 * Replaces a salary structure (CM-314). Components sent with their id
 * keep it, so members' overrides stay attached. 409
 * `SALARY_STRUCTURE_CHANGED` when someone saved after `expectedUpdatedAt`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "hrms.salary_structures",
      "update",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionHrmsSalaryStructureParamsModel.safeParse(
        await context.params,
      ),
    );
    const { expectedUpdatedAt, ...structure } = parseOrThrow(
      UpdateConstructionHrmsSalaryStructureRequestModel.safeParse(
        await request.json(),
      ),
    );
    const saved = await handlers.update({
      access: session.access,
      id,
      structure,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toSalaryStructureResponse(saved));
  } catch (error) {
    return mapError(error);
  }
}
