import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { unitSalesHandlers } from "@/src/composition/sales-bookings";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";
import { unitActions } from "@/src/sales/application/unit-sales-handlers";
import type { MemberAccess } from "@/src/shared-kernel/access";
import type { z } from "zod";

import {
  ConstructionSalesUnitParamsModel,
  toUnitResponse,
} from "./unit-models";

export type UnitContext = { params: Promise<{ unitId: string }> };

/** The unit as the panel shows it, with the viewer's actions. */
export async function unitBody(
  access: MemberAccess,
  projectId: string,
  unitId: string,
) {
  const unit = await unitSalesHandlers.unit(access, projectId, unitId);
  return toUnitResponse(unit, unitActions(access, unit));
}

/**
 * A POST on one unit's profile (Booking Update on the Project in the
 * body): access first, then the body, then `run`; answers with the unit.
 */
export function unitCommand<Schema extends z.ZodType<{ projectId: string }>>(
  schema: Schema,
  run: (
    access: MemberAccess,
    unitId: string,
    model: z.infer<Schema>,
  ) => Promise<void>,
) {
  return async (request: Request, context: UnitContext): Promise<Response> => {
    try {
      const { unitId } = parseOrThrow(
        ConstructionSalesUnitParamsModel.safeParse(await context.params),
      );
      const raw: unknown = await request.json();
      const session = await requireSalesProjectAccess(
        request,
        BOOKING_MENU,
        "update",
        requestProjectId(raw),
      );
      if (isResponse(session)) return session;
      const model = parseOrThrow(schema.safeParse(raw));
      await run(session.access, unitId, model);
      return Response.json(
        await unitBody(session.access, model.projectId, unitId),
      );
    } catch (error) {
      return mapError(error);
    }
  };
}

export const expected = (value: string | null) =>
  value == null ? null : new Date(value);
