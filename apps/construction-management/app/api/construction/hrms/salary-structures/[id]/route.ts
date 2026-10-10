import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createSalaryStructureHandlers } from "@/src/hrms/infrastructure/create-salary-handlers";

import {
  ConstructionHrmsSalaryStructureParamsModel,
  toSalaryStructureResponse,
} from "../salary-structure-models";

export const dynamic = "force-dynamic";

const handlers = createSalaryStructureHandlers();

/** One salary structure of the Active Company (CM-314). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "hrms.salary_structures",
      "read",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionHrmsSalaryStructureParamsModel.safeParse(
        await context.params,
      ),
    );
    return Response.json(
      toSalaryStructureResponse(
        await handlers.get({ access: session.access, id }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
