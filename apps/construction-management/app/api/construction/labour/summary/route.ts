import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { projectLabourSummary } from "@/src/labour/infrastructure/prisma-project-labour-summary";
import { can } from "@/src/shared-kernel/access";

import {
  GetConstructionLabourProjectSummaryRequestModel,
  toProjectSummaryResponse,
} from "./summary-models";

export const dynamic = "force-dynamic";

/**
 * The labour tiles on a Project's Overview (CM-219): labourers present
 * today, vendor headcount, the last two weeks (or `from` to `date` for the
 * Project Dashboard, CM-412), and labour and vendor payment status.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionLabourProjectSummaryRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const summary = await projectLabourSummary({
      workspaceId: session.workspaceId,
      projectId: model.projectId,
      date: model.date,
      from: model.from,
    });
    const options = { projectId: model.projectId };
    return Response.json(
      toProjectSummaryResponse(summary, {
        labour: can(session.access, "labour.labour", "financial", options),
        vendor: can(session.access, "labour.vendor", "financial", options),
      }),
    );
  } catch (error) {
    return mapError(error);
  }
}
