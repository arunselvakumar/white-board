import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectTestingReports } from "../../../handlers";
import { ConstructionProjectsTestingItemParamsModel } from "../../../testing-report-models";

export const dynamic = "force-dynamic";

/** Deletes a testing item with no reports (CM-409); 409 `TESTING_ITEM_NOT_EMPTY`. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id, itemId } = parseOrThrow(
      ConstructionProjectsTestingItemParamsModel.safeParse(
        await context.params,
      ),
    );
    await projectTestingReports.deleteItem({
      viewer: session.access,
      projectId: id,
      itemId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
