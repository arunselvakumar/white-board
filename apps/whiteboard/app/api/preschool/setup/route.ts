import { workspaces } from "@repo/auth/server";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { requireWorkspaceSession } from "@/app/api/_lib/require-workspace-session";
import { createSetUpPreschool } from "@/src/preschool/infrastructure/prisma-setup-store";

import { mapPreschoolError, parseOrThrow } from "../_lib/map-error";
import { SetUpPreschoolRequestModel } from "./setup-models";

export const dynamic = "force-dynamic";

const setUp = createSetUpPreschool();

/**
 * Sets up a Preschool Workspace that Workspace Creation left half-made: the
 * Owner only, and only when the Workspace's Institution Type is Preschool.
 * Safe to call again; an existing setup is returned unchanged.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireWorkspaceSession(
      ["owner"],
      "Only the Workspace Owner can set up the Preschool.",
    );
    if (session instanceof Response) return session;
    const institutionType = await workspaces.institutionType(
      session.workspaceId,
    );
    if (institutionType !== "preschool")
      return jsonError(
        StatusCodes.FORBIDDEN,
        "NOT_A_PRESCHOOL",
        "This Workspace is not a Preschool.",
      );
    const text = await request.text();
    const model = parseOrThrow(
      SetUpPreschoolRequestModel.safeParse(
        text.trim() === "" ? {} : (JSON.parse(text) as unknown),
      ),
    );
    const result = await setUp.execute({
      workspaceId: session.workspaceId,
      name: await workspaces.name(session.workspaceId),
      academicYearStartMonth: model.academicYearStartMonth,
    });
    return Response.json(result, {
      status: result.created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapPreschoolError(error);
  }
}
