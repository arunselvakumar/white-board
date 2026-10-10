import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createHrmsSettingsHandlers } from "@/src/hrms/infrastructure/create-hrms-ports";

import { mapHrmsSettings } from "../map-hrms-settings";
import { UpdateConstructionHrmsSettingsRequestModel } from "./update-hrms-settings-request-model";
import type { UpdateConstructionHrmsSettingsResponseModel } from "./update-hrms-settings-response-model";

export const dynamic = "force-dynamic";

const handlers = createHrmsSettingsHandlers();

/** Replaces the Active Company's HRMS Settings, audited with before and after (CM-303). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.settings", "update");
    if (isResponse(session)) return session;
    const { expectedUpdatedAt, ...settings } = parseOrThrow(
      UpdateConstructionHrmsSettingsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const saved = await handlers.updateHrmsSettings({
      access: session.access,
      settings,
      expectedUpdatedAt:
        expectedUpdatedAt == null ? null : new Date(expectedUpdatedAt),
    });
    const body: UpdateConstructionHrmsSettingsResponseModel =
      mapHrmsSettings(saved);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
