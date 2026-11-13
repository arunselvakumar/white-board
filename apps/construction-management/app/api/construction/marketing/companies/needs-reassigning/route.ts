import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { teamHandlers } from "@/src/composition/marketing-team-page";

import { toNeedsReassigningResponse } from "../../team/team-models";
import { COMPANIES_MENU } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Prospect Companies and open Follow-ups whose person is no longer an
 * active Marketing Person (ADR CM-0040 §4). Needs Companies transfer; the
 * route asks only read, so an ended plan does not hide the list.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Companies `transfer` is checked in the handler (needsReassigning).
    const session = await requireAccess(request, COMPANIES_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toNeedsReassigningResponse(
        await teamHandlers.needsReassigning(session.access),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
