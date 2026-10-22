import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  clientBillHandlers,
  requestProjectId,
  requireClientBillProjectAccess,
} from "../client-bill-access";
import { toClientContractResponse } from "../client-bill-models";

export const dynamic = "force-dynamic";

/**
 * The Project's client contract terms (CM-1107): retention % and cap,
 * completion release %, DLP months, handover date, SAC and GST rate, with
 * the BOQ's value and the retention receivable. Needs Client Bill read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireClientBillProjectAccess(
      request,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toClientContractResponse(
        projectId,
        await clientBillHandlers.contract(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
