import type { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import type { AccessSession } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { requireSalesRecordAccess } from "@/app/api/construction/sales/sales-access";
import { bookingHandlers } from "@/src/composition/sales-bookings";
import { bookingActions } from "@/src/sales/application/booking-handlers";
import type { StoredBooking } from "@/src/sales/application/booking-ports";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";
import type { Flag, MemberAccess } from "@/src/shared-kernel/access";

import {
  ConstructionSalesBookingParamsModel,
  toBookingDetailResponse,
} from "./booking-models";

export type BookingContext = { params: Promise<{ id: string }> };

/**
 * The Session plus the Permission Matrix check for a route about one
 * booking: it is found first (404 `BOOKING_NOT_FOUND` for another
 * Company's or a deleted one), then `flag` is checked on its Project.
 */
export function requireBookingAccess(
  request: Request,
  id: string,
  flag: Flag,
): Promise<(AccessSession & { target: StoredBooking }) | Response> {
  return requireSalesRecordAccess(request, BOOKING_MENU, flag, (workspaceId) =>
    bookingHandlers.find(workspaceId, id),
  );
}

export async function bookingBody(access: MemberAccess, id: string) {
  const booking = await bookingHandlers.get(access, id);
  return toBookingDetailResponse(booking, bookingActions(access, booking));
}

export async function bookingId(context: BookingContext): Promise<string> {
  return parseOrThrow(
    ConstructionSalesBookingParamsModel.safeParse(await context.params),
  ).id;
}

/** A POST on one booking: access, then the body, then `run`; answers with the booking. */
export function bookingCommand<Schema extends z.ZodType>(
  schema: Schema,
  flag: Flag,
  run: (
    access: MemberAccess,
    id: string,
    model: z.infer<Schema>,
  ) => Promise<void>,
  options: { answer: "booking" | "none" } = { answer: "booking" },
) {
  return async (
    request: Request,
    context: BookingContext,
  ): Promise<Response> => {
    try {
      const id = await bookingId(context);
      const session = await requireBookingAccess(request, id, flag);
      if (isResponse(session)) return session;
      const model = parseOrThrow(schema.safeParse(await request.json()));
      await run(session.access, id, model);
      if (options.answer === "none") return new Response(null, { status: 204 });
      return Response.json(await bookingBody(session.access, id));
    } catch (error) {
      return mapError(error);
    }
  };
}
