import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createGrnFieldSettingHandlers } from "@/src/organization/infrastructure/create-grn-field-setting-handlers";

import {
  UpdateConstructionOrganizationGrnFieldSettingRequestModel,
  mapGrnFieldSetting,
  type GetConstructionOrganizationGrnFieldSettingResponseModel,
} from "../grn-field-setting-models";

export const dynamic = "force-dynamic";

const handlers = createGrnFieldSettingHandlers();

/** Replaces the list of hidden GRN fields, audited with before and after (CM-501). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "update",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionOrganizationGrnFieldSettingRequestModel.safeParse(
        await request.json(),
      ),
    );
    const saved = await handlers.update({
      workspaceId: session.workspaceId,
      hiddenFields: model.hiddenFields,
      expectedUpdatedAt:
        model.expectedUpdatedAt == null
          ? null
          : new Date(model.expectedUpdatedAt),
      by: session.userId,
    });
    const body: GetConstructionOrganizationGrnFieldSettingResponseModel =
      mapGrnFieldSetting(saved);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
