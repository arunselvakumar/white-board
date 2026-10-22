import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  advanceHandlers,
  requireContractAccess,
  respond,
} from "../../../advances/advance-access";
import { ConstructionContractsClientContractQueryModel } from "../../../advances/advance-models";

export const dynamic = "force-dynamic";

/**
 * The client contract's advances received, bank guarantees, retention
 * receivable (deducted, released, releasable) and DLP from the handover
 * date (CM-1108). Needs Client Bills read; money is null without Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { projectId } = parseOrThrow(
      ConstructionContractsClientContractQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireContractAccess(request, "read", {
      projectId,
    });
    if (isResponse(session)) return session;
    return respond(
      await advanceHandlers.overview(session.access, { projectId }),
    );
  } catch (error) {
    return mapError(error);
  }
}
