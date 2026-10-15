import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { trackingProjectProgress } from "@/src/composition/project-progress";

import {
  projectHandlers as handlers,
  projectFinancial,
  projectHome,
} from "../handlers";
import { CreateConstructionProjectsProjectRequestModel } from "./create-project-request-model";
import {
  ListConstructionProjectsProjectsQueryModel,
  type ListConstructionProjectsProjectsResponseModel,
} from "./list-projects-models";
import { toProjectResponse } from "./project-models";

export const dynamic = "force-dynamic";

/** Project Progress % on each card, from Tasks (CM-805). */
const projectProgress = trackingProjectProgress();

/**
 * Projects home (CM-204): the Projects the caller may see — every one for
 * the Owner, the assigned ones for a Member — the caller's pinned ones
 * first (CM-411), each group by status then name, with counts per status
 * for the filter chips, and each Project's progress from Tasks (CM-805).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const { status } = parseOrThrow(
      ListConstructionProjectsProjectsQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await handlers.list(session.access, status);
    const { items, pinned } = await projectHome.pinnedFirst(
      session.access,
      page.items,
    );
    const financial = projectFinancial(session.access);
    const progress = await projectProgress.progressOf(
      session.workspaceId,
      items.map((item) => item.id),
    );
    const body: ListConstructionProjectsProjectsResponseModel = {
      items: items.map((item) => ({
        ...toProjectResponse(item, financial),
        pinned: pinned.has(item.id),
        progress: progress.get(item.id) ?? null,
      })),
      total: page.total,
      counts: page.counts,
      financial,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * New Project (CM-204). 402 `PLAN_LIMIT_EXCEEDED` beyond the plan (CM-118).
 * The creator is not assigned to it; the Owner assigns Team Members. It
 * starts with the seed drawing albums and testing items (CM-401). Without
 * the Financial flag an `orderValue` or `budgetValue` in the body is
 * ignored.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionProjectsProjectRequestModel.safeParse(
        await request.json(),
      ),
    );
    const financial = projectFinancial(session.access);
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      by: session.userId,
      details: model,
      financial,
    });
    return Response.json(toProjectResponse(created, financial), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
