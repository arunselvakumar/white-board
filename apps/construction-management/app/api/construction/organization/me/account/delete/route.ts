import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { accountDeletionHandlers } from "@/src/composition/account";

import { DeleteConstructionOrganizationMyAccountRequestModel } from "../account-models";

export const dynamic = "force-dynamic";

/**
 * Delete My Account (CM-907). Refused with 409 `OWNER_MUST_HAND_OVER`
 * while the User owns a Company. Otherwise they leave every Company (each
 * Team Member is kept, marked Left and unlinked), their push
 * subscriptions, notifications, preferences and sessions are deleted, and
 * their identity is erased; this request's session ends too.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      DeleteConstructionOrganizationMyAccountRequestModel.safeParse(
        await request.json(),
      ),
    );
    await accountDeletionHandlers.deleteAccount({
      userId: session.userId,
      reason: body.reason ?? null,
      confirmation: body.confirmation,
      code: body.code,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
