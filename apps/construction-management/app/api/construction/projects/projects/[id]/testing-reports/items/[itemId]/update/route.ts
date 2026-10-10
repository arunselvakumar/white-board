import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectTestingReports } from "../../../handlers";
import {
  ConstructionProjectsTestingItemParamsModel,
  UpdateConstructionProjectsTestingItemRequestModel,
} from "../../../testing-report-models";
import { toTestingItemResponse } from "../../../testing-report-responses";

export const dynamic = "force-dynamic";

/**
 * Renames a testing item (CM-409). 409 `TESTING_ITEM_CHANGED` on a stale
 * `updatedAt`, `TESTING_ITEM_NAME_IN_USE`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "update",
    );
    if (isResponse(session)) return session;
    const { id, itemId } = parseOrThrow(
      ConstructionProjectsTestingItemParamsModel.safeParse(
        await context.params,
      ),
    );
    const body = parseOrThrow(
      UpdateConstructionProjectsTestingItemRequestModel.safeParse(
        await request.json(),
      ),
    );
    const item = await projectTestingReports.renameItem({
      viewer: session.access,
      projectId: id,
      itemId,
      name: body.name,
      expectedUpdatedAt: new Date(body.updatedAt),
      by: session.userId,
    });
    const counted = (
      await projectTestingReports.items(session.access, id)
    ).find((candidate) => candidate.id === item.id);
    return Response.json(
      toTestingItemResponse(item, counted?.reportCount ?? 0),
    );
  } catch (error) {
    return mapError(error);
  }
}
