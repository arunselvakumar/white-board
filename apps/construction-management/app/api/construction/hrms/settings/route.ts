import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createHrmsSettingsHandlers } from "@/src/hrms/infrastructure/create-hrms-ports";

import { mapHrmsSettings } from "./map-hrms-settings";

export const dynamic = "force-dynamic";

const handlers = createHrmsSettingsHandlers();

/** The Active Company's HRMS Settings, or the defaults before the first save (CM-303). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.settings", "read");
    if (isResponse(session)) return session;
    return Response.json(
      mapHrmsSettings(
        await handlers.getHrmsSettings({ access: session.access }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
