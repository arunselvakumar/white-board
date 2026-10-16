import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { accountDeletionHandlers } from "@/src/composition/account";

import type { GetConstructionOrganizationMyAccountResponseModel } from "./account-models";

export const dynamic = "force-dynamic";

/** The Companies the signed-in User owns (CM-907). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const body: GetConstructionOrganizationMyAccountResponseModel =
      await accountDeletionHandlers.status(session.userId);
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return mapError(error);
  }
}
