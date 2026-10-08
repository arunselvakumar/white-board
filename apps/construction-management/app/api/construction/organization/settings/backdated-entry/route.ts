import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBackdatedPolicyHandlers } from "@/src/organization/infrastructure/create-backdated-policy-handlers";

import { mapBackdatedEntryPolicy } from "./map-backdated-entry-policy";

export const dynamic = "force-dynamic";

const handlers = createBackdatedPolicyHandlers();

/** The Active Company's Back-dated Entry policy (CM-113). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "read",
    );
    if (isResponse(session)) return session;
    return Response.json(
      mapBackdatedEntryPolicy(await handlers.get(session.workspaceId)),
    );
  } catch (error) {
    return mapError(error);
  }
}
