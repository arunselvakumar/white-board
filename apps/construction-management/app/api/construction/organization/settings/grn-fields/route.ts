import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createGrnFieldSettingHandlers } from "@/src/organization/infrastructure/create-grn-field-setting-handlers";

import {
  mapGrnFieldSetting,
  type GetConstructionOrganizationGrnFieldSettingResponseModel,
} from "./grn-field-setting-models";

export const dynamic = "force-dynamic";

const handlers = createGrnFieldSettingHandlers();

/** Which optional GRN fields the Company hides (CM-501, ADR CM-0015 §9). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "read",
    );
    if (isResponse(session)) return session;
    const body: GetConstructionOrganizationGrnFieldSettingResponseModel =
      mapGrnFieldSetting(await handlers.get(session.workspaceId));
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
