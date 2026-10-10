import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { wingHandlers } from "../../handlers";
import { ConstructionProjectsWingParamsModel } from "../../wing-models";

export const dynamic = "force-dynamic";

/** Deletes a Wing with its floors and units (CM-402): tombstones. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; wingId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.wings", "delete");
    if (isResponse(session)) return session;
    const { id, wingId } = parseOrThrow(
      ConstructionProjectsWingParamsModel.safeParse(await context.params),
    );
    await wingHandlers.delete({
      viewer: session.access,
      projectId: id,
      wingId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
