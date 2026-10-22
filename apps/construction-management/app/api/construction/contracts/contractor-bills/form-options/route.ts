import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  contractorBillHandlers,
  requestProjectId,
  requireContractorBillProjectAccess,
} from "../contractor-bill-access";
import { toFormOptionsResponse } from "../contractor-bill-models";

export const dynamic = "force-dynamic";

/**
 * The new-bill form's choices (CM-1106): the Project's issued Work Orders,
 * the checked rows each has waiting to be billed per date measured, and
 * any bill already open on it. Needs Contractor Bill create.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireContractorBillProjectAccess(
      request,
      "create",
      projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toFormOptionsResponse(
        await contractorBillHandlers.formOptions(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
