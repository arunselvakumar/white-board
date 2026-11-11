import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { assertKnownProjects } from "@/src/organization/application/project-directory";

import { ListConstructionMastersQueryModel } from "../_lib/master-models";
import { siteEngineerHandlers as handlers, projectDirectory } from "./handlers";
import {
  CreateConstructionMastersSiteEngineerRequestModel,
  SITE_ENGINEER_MENU,
  siteEngineerInput,
  toSiteEngineerCreatedResponse,
  toSiteEngineerResponse,
} from "./site-engineer-models";

export const dynamic = "force-dynamic";

/**
 * Every live Site Engineer of the Active Company by name, with how each
 * signs in (ADR CM-0037); `?status=enabled` leaves disabled ones out.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, SITE_ENGINEER_MENU, "read");
    if (isResponse(session)) return session;
    const { status } = parseOrThrow(
      ListConstructionMastersQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const items = await handlers.list(session.workspaceId, status);
    return Response.json({
      items: items.map((item) => toSiteEngineerResponse(item, session.access)),
      total: items.length,
    });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Add Site Engineer (ADR CM-0037): the record and their sign-in on the
 * Site Engineer Role, invited or with a first password.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, SITE_ENGINEER_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionMastersSiteEngineerRequestModel.safeParse(
        await request.json(),
      ),
    );
    await assertKnownProjects(
      projectDirectory,
      session.workspaceId,
      model.projectIds,
    );
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      by: session.userId,
      grantor: session.access,
      details: siteEngineerInput(model, session.access),
      signIn: {
        invite: model.signIn.invite,
        password: model.signIn.password ?? null,
      },
    });
    return Response.json(
      toSiteEngineerCreatedResponse(created, session.access),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
