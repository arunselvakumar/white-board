import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHandlers as handlers } from "../../../handlers";
import { ConstructionProjectsProjectParamsModel } from "../../project-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a Project (CM-204): a tombstone. 409 `PROJECT_IN_USE` while
 * labours, vendors, attendance or wage payments point at it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    await handlers.delete({ viewer: session.access, id, by: session.userId });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
