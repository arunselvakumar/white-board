import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { deviceHandlers } from "@/src/composition/account";

import { ConstructionOrganizationDeviceParamsModel } from "../../device-models";

export const dynamic = "force-dynamic";

/**
 * Signs one of the User's other devices out and deletes its push
 * subscriptions. 404 `DEVICE_NOT_FOUND`; 409 `DEVICE_IS_THIS_ONE`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationDeviceParamsModel.safeParse(await context.params),
    );
    await deviceHandlers.signOut({
      userId: session.userId,
      sessionId: id,
      currentSessionId: session.sessionId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
