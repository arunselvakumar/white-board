import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createSalaryStructureHandlers } from "@/src/hrms/infrastructure/create-salary-handlers";

import {
  ConstructionHrmsSalaryStructureParamsModel,
  DeleteConstructionHrmsSalaryStructureRequestModel,
} from "../../salary-structure-models";

export const dynamic = "force-dynamic";

const handlers = createSalaryStructureHandlers();

/**
 * Deletes a salary structure (CM-314). 409 `SALARY_STRUCTURE_IN_USE`
 * while a member's salary configuration uses it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "hrms.salary_structures",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionHrmsSalaryStructureParamsModel.safeParse(
        await context.params,
      ),
    );
    const { expectedUpdatedAt } = parseOrThrow(
      DeleteConstructionHrmsSalaryStructureRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete({
      access: session.access,
      id,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
