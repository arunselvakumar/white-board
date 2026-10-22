import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import type { StoredWorkOrder } from "@/src/contracts/application/work-order-ports";
import type { Flag } from "@/src/shared-kernel/access";

import { requireWorkOrderAccess, workOrderHandlers } from "./work-order-access";
import {
  ConstructionContractsWorkOrderParamsModel,
  toWorkOrderResponse,
} from "./work-order-models";

type Context = { params: Promise<{ id: string }> };

/**
 * A route about one Work Order: loads it (404 WORK_ORDER_NOT_FOUND for
 * another Company's or a deleted one), checks `flags` on its Project (any
 * one), runs `act` and answers with the Work Order as it now is, warnings
 * included.
 */
export function workOrderRoute(
  flags: Flag | readonly [Flag, ...Flag[]],
  act: (
    session: AccessSession & { target: StoredWorkOrder },
    id: string,
    request: Request,
  ) => Promise<unknown>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    try {
      const { id } = parseOrThrow(
        ConstructionContractsWorkOrderParamsModel.safeParse(
          await context.params,
        ),
      );
      const session = await requireWorkOrderAccess(request, flags, id);
      if (isResponse(session)) return session;
      await act(session, id, request);
      const detail = await workOrderHandlers.get(session.access, id);
      return Response.json(toWorkOrderResponse(detail));
    } catch (error) {
      return mapError(error);
    }
  };
}

/** `expectedUpdatedAt` as a Date, or null when not sent. */
export function expected(raw: string | undefined): Date | null {
  return raw == null ? null : new Date(raw);
}
