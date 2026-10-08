import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createCompanyProfileHandlers } from "@/src/organization/infrastructure/create-company-profile-handlers";

import { companyProfileBody } from "../company-profile-body";
import { UpdateConstructionOrganizationCompanyProfileRequestModel } from "./update-company-profile-request-model";

export const dynamic = "force-dynamic";

const handlers = createCompanyProfileHandlers();

/**
 * Changes the Company's name, contact, tax ids, address, currency and time
 * zone (`organization.settings` update). A new name also renames the
 * Company in the switcher.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "update",
    );
    if (isResponse(session)) return session;
    const { expectedUpdatedAt, ...changes } = parseOrThrow(
      UpdateConstructionOrganizationCompanyProfileRequestModel.safeParse(
        await request.json(),
      ),
    );
    const profile = await handlers.update({
      workspaceId: session.workspaceId,
      by: session.userId,
      changes,
      ...(expectedUpdatedAt == null
        ? {}
        : { expectedUpdatedAt: new Date(expectedUpdatedAt) }),
    });
    return Response.json(companyProfileBody(profile, session.access));
  } catch (error) {
    return mapError(error);
  }
}
