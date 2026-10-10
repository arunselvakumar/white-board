import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../../project-models";
import { projectTestingReports } from "../handlers";
import { CreateConstructionProjectsTestingItemRequestModel } from "../testing-report-models";
import { toTestingItemListItem } from "../testing-report-responses";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The Project's testing items by name, with report counts (CM-409). */
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "read",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const items = await projectTestingReports.items(session.access, id);
    return Response.json({ items: items.map(toTestingItemListItem) });
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a testing item; 409 `TESTING_ITEM_NAME_IN_USE`. */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "create",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      CreateConstructionProjectsTestingItemRequestModel.safeParse(
        await request.json(),
      ),
    );
    const item = await projectTestingReports.addItem({
      viewer: session.access,
      projectId: id,
      name: body.name,
      by: session.userId,
    });
    return Response.json(toTestingItemListItem(item), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
