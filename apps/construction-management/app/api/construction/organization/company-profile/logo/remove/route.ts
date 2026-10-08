import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createCompanyProfileHandlers } from "@/src/organization/infrastructure/create-company-profile-handlers";

import { companyProfileBody } from "../../company-profile-body";

export const dynamic = "force-dynamic";

const handlers = createCompanyProfileHandlers();

/** Removes the logo (`organization.settings` update); fine when there is none. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "update",
    );
    if (isResponse(session)) return session;
    const profile = await handlers.removeLogo({
      workspaceId: session.workspaceId,
      by: session.userId,
    });
    return Response.json(companyProfileBody(profile, session.access));
  } catch (error) {
    return mapError(error);
  }
}
