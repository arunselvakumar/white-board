import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { deviceHandlers } from "@/src/composition/account";

import { toDevicesResponse } from "./device-models";

export const dynamic = "force-dynamic";

/** The signed-in User's devices, this one first (CM-907). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const items = await deviceHandlers.list(session.userId, session.sessionId);
    return Response.json(toDevicesResponse(items), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return mapError(error);
  }
}
