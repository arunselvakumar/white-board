import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { contentDisposition } from "@/app/api/_lib/uploads";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";
import { trackingDirectory } from "@/src/composition/tracking-directory";
import {
  taskImportSample,
  XLSX_CONTENT_TYPE,
} from "@/src/tracking/infrastructure/task-workbook";

import { TASK_MENU } from "../handlers";
import { ImportConstructionTrackingTasksRequestModel } from "../task-models";

export const dynamic = "force-dynamic";

/**
 * The task import sample (CM-802): the headers and three example rows (a
 * task and two sub-tasks) naming a Team Member and a unit of the Company.
 * Needs Task read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ImportConstructionTrackingTasksRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireTrackingProjectAccess(
      request,
      TASK_MENU,
      "read",
      query.projectId,
    );
    if (isResponse(session)) return session;
    const options = await trackingDirectory.options(
      prisma,
      session.workspaceId,
      query.projectId,
      ["members", "units"],
    );
    const bytes = await taskImportSample({
      memberName:
        options.members.find((member) => !member.isOwner)?.name ??
        options.members[0]?.name ??
        "",
      unitName:
        options.units.find((unit) => unit.name.toLowerCase() === "cum")?.name ??
        options.units[0]?.name ??
        "",
    });
    return new Response(bytes, {
      headers: {
        "content-type": XLSX_CONTENT_TYPE,
        "content-disposition": contentDisposition(
          "attachment",
          "tasks-import-sample.xlsx",
        ),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
