import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";
import { createTaskImportDeps } from "@/src/composition/tracking-tasks";
import { importTasks } from "@/src/tracking/application/task-import";
import { readTaskSheet } from "@/src/tracking/infrastructure/task-workbook";

import { TASK_MENU } from "../handlers";
import { ImportConstructionTrackingTasksRequestModel } from "../task-models";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;
const deps = createTaskImportDeps();

/**
 * Imports tasks from the sample (CM-802, ADR CM-0019 §13): the body is the
 * .xlsx itself. Every row becomes a task on the Project, or none does: 400
 * `IMPORT_HAS_ERRORS` with `details.errors` = [{ row, field, message }].
 * Needs Task create on the Project (the menu has no Import flag).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ImportConstructionTrackingTasksRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireTrackingProjectAccess(
      request,
      TASK_MENU,
      "create",
      query.projectId,
    );
    if (isResponse(session)) return session;
    const upload = await readUpload(request, MAX_BYTES);
    const rows = await readTaskSheet(upload.bytes);
    const result = await importTasks(
      deps,
      session.access,
      query.projectId,
      rows,
    );
    return Response.json(result, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
