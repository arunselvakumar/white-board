import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectFinancial, projectHome } from "../../../../handlers";
import { ConstructionProjectsProjectParamsModel } from "../../../project-models";
import { toProjectSummaryResponse } from "../dashboard-models";

export const dynamic = "force-dynamic";

/**
 * The Project Dashboard's Project summary (CM-412): dates, status, type,
 * budget (Financial) and what the Project holds. The Dashboard menu's
 * Read flag; 404 for another Company's Project or one a Member is not on.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "reporting.project_dashboard",
      "read",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toProjectSummaryResponse(
        await projectHome.summary(session.access, id),
        projectFinancial(session.access),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
