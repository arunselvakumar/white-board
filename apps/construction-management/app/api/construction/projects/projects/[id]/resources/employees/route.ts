import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeNameCursor,
  encodeNameCursor,
} from "@/src/shared-kernel/list-cursor";

import { ConstructionProjectsProjectParamsModel } from "../../../project-models";
import { projectEmployees } from "./handlers";
import {
  AddConstructionProjectsProjectEmployeesRequestModel,
  ListConstructionProjectsProjectEmployeesRequestModel,
  toProjectEmployeeResponse,
  type ListConstructionProjectsProjectEmployeesResponseModel,
} from "./project-employees-models";

export const dynamic = "force-dynamic";

type IdContext = { params: Promise<{ id: string }> };

/**
 * The Employees on a Project, by name, each with their Role, searchable
 * and paged both ways (ADR CM-0038 §2, CM-0055 §5). Project menu Read; 404 for a Project the caller is
 * not on.
 */
export async function GET(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      ListConstructionProjectsProjectEmployeesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await projectEmployees.list(session.access, id, {
      limit: model.limit,
      ...(model.search == null || model.search === ""
        ? {}
        : { search: model.search }),
      ...(model.after == null ? {} : { after: decodeNameCursor(model.after) }),
      ...(model.before == null
        ? {}
        : { before: decodeNameCursor(model.before) }),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionProjectsProjectEmployeesResponseModel = {
      items: page.items.map(toProjectEmployeeResponse),
      nextCursor: moreAfter && last != null ? encodeNameCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeNameCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Adds Employees to the Project from a date, written by the labour context
 * as Edit Employee writes them, and their sign-ins follow; all or none
 * (ADR CM-0038 §2, CM-0055 §5). Project menu Update.
 */
export async function POST(
  request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      AddConstructionProjectsProjectEmployeesRequestModel.safeParse(
        await request.json(),
      ),
    );
    await projectEmployees.add(session.access, id, body);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
