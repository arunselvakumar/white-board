import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";

import { TASK_MENU, taskHandlers as handlers } from "./handlers";
import {
  CreateConstructionTrackingTaskRequestModel,
  ListConstructionTrackingTasksRequestModel,
  toTaskResponse,
  type ListConstructionTrackingTasksResponse,
} from "./task-models";

export const dynamic = "force-dynamic";

/**
 * A Project's task tree (CM-802): a page of top-level tasks in their
 * order, each followed by its sub-tasks, with derived status, roll-ups
 * and earned value (null without Financial). Filters match any level and
 * bring the ancestors along. Without View all, only the caller's own and
 * assigned tasks, with their ancestors as context. Needs Task read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireTrackingProjectAccess(
      request,
      TASK_MENU,
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionTrackingTasksRequestModel.safeParse(query),
    );
    const page = await handlers.list(session.access, model);
    const body: ListConstructionTrackingTasksResponse = {
      ...page,
      items: page.items.map(toTaskResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Adds a task, or with `parentId` a sub-task (CM-802): the next Task No.
 * of the Project, the baseline from its dates. Needs Task create on the
 * Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireTrackingProjectAccess(
      request,
      TASK_MENU,
      "create",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionTrackingTaskRequestModel.safeParse(raw),
    );
    const id = await handlers.create(session.access, model);
    return Response.json({ id }, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
