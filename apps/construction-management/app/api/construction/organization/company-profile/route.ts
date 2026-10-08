import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createCompanyProfileHandlers } from "@/src/organization/infrastructure/create-company-profile-handlers";

import { companyProfileBody } from "./company-profile-body";

export const dynamic = "force-dynamic";

const handlers = createCompanyProfileHandlers();

/** The Active Company's profile (`organization.settings` read). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "read",
    );
    if (isResponse(session)) return session;
    const profile = await handlers.get(session.workspaceId);
    return Response.json(companyProfileBody(profile, session.access));
  } catch (error) {
    return mapError(error);
  }
}
