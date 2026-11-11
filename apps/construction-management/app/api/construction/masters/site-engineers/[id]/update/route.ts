import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { assertKnownProjects } from "@/src/organization/application/project-directory";

import { ConstructionMastersIdParamsModel } from "../../../_lib/master-models";
import {
  siteEngineerHandlers as handlers,
  projectDirectory,
} from "../../handlers";
import {
  SITE_ENGINEER_MENU,
  UpdateConstructionMastersSiteEngineerRequestModel,
  siteEngineerInput,
  toSiteEngineerResponse,
} from "../../site-engineer-models";

export const dynamic = "force-dynamic";

/**
 * Edit Site Engineer with the `updatedAt` you loaded (409
 * SUPERVISOR_CHANGED when stale). An older one without a sign-in gets one
 * now (`signIn`, else 400 SIGN_IN_REQUIRED).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, SITE_ENGINEER_MENU, "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMastersIdParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdateConstructionMastersSiteEngineerRequestModel.safeParse(
        await request.json(),
      ),
    );
    await assertKnownProjects(
      projectDirectory,
      session.workspaceId,
      model.projectIds,
    );
    const item = await handlers.update({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
      details: siteEngineerInput(model, session.access),
      ...(model.signIn == null
        ? {}
        : {
            signIn: {
              invite: model.signIn.invite,
              password: model.signIn.password ?? null,
            },
          }),
    });
    return Response.json(toSiteEngineerResponse(item, session.access));
  } catch (error) {
    return mapError(error);
  }
}
