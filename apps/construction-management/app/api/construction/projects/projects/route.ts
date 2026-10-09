import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHandlers as handlers } from "../handlers";
import { CreateConstructionProjectsProjectRequestModel } from "./create-project-request-model";
import {
  ListConstructionProjectsProjectsQueryModel,
  type ListConstructionProjectsProjectsResponseModel,
} from "./list-projects-models";
import { toProjectResponse } from "./project-models";

export const dynamic = "force-dynamic";

/**
 * Projects home (CM-204): the Projects the caller may see — every one for
 * the Owner, the assigned ones for a Member — by status then name, with
 * counts per status for the filter chips.
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
    const body: ListConstructionProjectsProjectsResponseModel = {
      items: page.items.map(toProjectResponse),
      total: page.total,
      counts: page.counts,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * New Project (CM-204). 402 `PLAN_LIMIT_EXCEEDED` beyond the plan (CM-118).
 * The creator is not assigned to it; the Owner assigns Team Members.
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
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      by: session.userId,
      details: model,
    });
    return Response.json(toProjectResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
