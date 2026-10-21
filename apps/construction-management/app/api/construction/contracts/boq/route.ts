import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  boqHandlers,
  requestProjectId,
  requireBoqProjectAccess,
} from "./boq-access";
import { toBoqResponse } from "./boq-models";

export const dynamic = "force-dynamic";

/**
 * A Project's BOQ (CM-1103, ADR CM-0023 §4): its sections in order with
 * their items, each section's subtotal and the BOQ total beside the
 * Project's Order Value. Without BOQ Financial, rates, amounts, totals and
 * the Order Value are null. Needs BOQ read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = requestProjectId(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const session = await requireBoqProjectAccess(request, "read", projectId);
    if (isResponse(session)) return session;
    return Response.json(
      toBoqResponse(await boqHandlers.boq(session.access, projectId)),
    );
  } catch (error) {
    return mapError(error);
  }
}
