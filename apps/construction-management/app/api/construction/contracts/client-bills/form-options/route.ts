import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  clientBillHandlers,
  requestProjectId,
  requireClientBillProjectAccess,
} from "../client-bill-access";
import { toClientBillFormOptionsResponse } from "../client-bill-models";

export const dynamic = "force-dynamic";

/**
 * The new-bill dialog's facts (CM-1107): whether the Project can be billed
 * (Contract work, a Client, a state), the checked client-side rows waiting
 * per date measured, and any bill already open. Needs Client Bill create.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireClientBillProjectAccess(
      request,
      "create",
      projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toClientBillFormOptionsResponse(
        await clientBillHandlers.formOptions(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
