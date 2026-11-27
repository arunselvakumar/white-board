import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectLabours } from "../../handlers";
import {
  ConstructionProjectsProjectLabourParamsModel,
  RemoveConstructionProjectsProjectLabourRequestModel,
} from "../../project-labours-models";

export const dynamic = "force-dynamic";

/**
 * Takes a Labour off the Project after their Last day; attendance, wages
 * and payments already recorded stay (ADR CM-0038 §2). Project menu
 * Update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; labourId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    const { id, labourId } = parseOrThrow(
      ConstructionProjectsProjectLabourParamsModel.safeParse(
        await context.params,
      ),
    );
    const body = parseOrThrow(
      RemoveConstructionProjectsProjectLabourRequestModel.safeParse(
        await request.json(),
      ),
    );
    await projectLabours.remove(session.access, id, labourId, body);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
