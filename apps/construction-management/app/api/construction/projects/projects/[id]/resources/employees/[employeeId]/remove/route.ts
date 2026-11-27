import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectEmployees } from "../../handlers";
import {
  ConstructionProjectsProjectEmployeeParamsModel,
  RemoveConstructionProjectsProjectEmployeeRequestModel,
} from "../../project-employees-models";

export const dynamic = "force-dynamic";

/**
 * Takes an Employee off the Project after their Last day, and off their
 * sign-in's Projects; attendance, wages and payments already recorded
 * stay (ADR CM-0038 §2, CM-0055 §5). Project menu Update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; employeeId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    const { id, employeeId } = parseOrThrow(
      ConstructionProjectsProjectEmployeeParamsModel.safeParse(
        await context.params,
      ),
    );
    const body = parseOrThrow(
      RemoveConstructionProjectsProjectEmployeeRequestModel.safeParse(
        await request.json(),
      ),
    );
    await projectEmployees.remove(session.access, id, employeeId, body);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
