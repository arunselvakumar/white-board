import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import type { StoredMeasurementSheet } from "@/src/contracts/application/measurement-ports";
import type { Flag } from "@/src/shared-kernel/access";

import {
  measurementHandlers,
  requireMeasurementAccess,
} from "./measurement-access";
import {
  ConstructionContractsMeasurementParamsModel,
  toMeasurementResponse,
} from "./measurement-models";

type Context = { params: Promise<{ id: string }> };

/**
 * A route about one sheet: loads it (404 MEASUREMENT_NOT_FOUND for another
 * Company's or a deleted one), checks `flags` on its Project (any one),
 * runs `act` and answers with the sheet as it now is.
 */
export function measurementRoute(
  flags: Flag | readonly [Flag, ...Flag[]],
  act: (
    session: AccessSession & { target: StoredMeasurementSheet },
    id: string,
    request: Request,
  ) => Promise<unknown>,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    try {
      const { id } = parseOrThrow(
        ConstructionContractsMeasurementParamsModel.safeParse(
          await context.params,
        ),
      );
      const session = await requireMeasurementAccess(request, flags, id);
      if (isResponse(session)) return session;
      await act(session, id, request);
      const detail = await measurementHandlers.get(session.access, id);
      return Response.json(toMeasurementResponse(detail));
    } catch (error) {
      return mapError(error);
    }
  };
}

/** `expectedUpdatedAt` as a Date, or null when not sent. */
export function expected(raw: string | undefined): Date | null {
  return raw == null ? null : new Date(raw);
}
