import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import type { StoredVariation } from "@/src/contracts/application/boq-ports";
import { can, type Flag } from "@/src/shared-kernel/access";

import {
  BOQ_MENU,
  requireBoqRecordAccess,
  variationHandlers,
} from "../boq-access";
import {
  ConstructionContractsBoqParamsModel,
  toVariationResponse,
} from "../boq-models";

type Context = { params: Promise<{ id: string }> };

/**
 * A route about one Variation: loads it (404 VARIATION_NOT_FOUND for
 * another Company's or a deleted one), checks `flags` on its Project, runs
 * `act` and answers with the Variation as it now is.
 */
export function variationRoute(
  flags: Flag | readonly [Flag, ...Flag[]],
  act: (
    session: AccessSession & { target: StoredVariation },
    id: string,
    request: Request,
  ) => Promise<StoredVariation>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    try {
      const { id } = parseOrThrow(
        ConstructionContractsBoqParamsModel.safeParse(await context.params),
      );
      const session = await requireBoqRecordAccess(request, flags, (ws) =>
        variationHandlers.find(ws, id),
      );
      if (isResponse(session)) return session;
      const variation = await act(session, id, request);
      const [view] = await variationHandlers.views(session.workspaceId, [
        variation,
      ]);
      if (view == null) throw new Error("The Variation was not found.");
      return Response.json(
        toVariationResponse(
          view,
          can(session.access, BOQ_MENU, "financial", {
            projectId: variation.projectId,
          }),
        ),
      );
    } catch (error) {
      return mapError(error);
    }
  };
}
