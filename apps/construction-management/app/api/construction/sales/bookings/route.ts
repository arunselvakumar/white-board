import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { bookingHandlers } from "@/src/composition/sales-bookings";
import { bookingActions } from "@/src/sales/application/booking-handlers";
import { BOOKING_MENU } from "@/src/sales/application/sales-booking-deps";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  CreateConstructionSalesBookingRequestModel,
  ListConstructionSalesBookingsRequestModel,
  toBookingResponse,
  type ListConstructionSalesBookingsResponse,
} from "./booking-models";
import { bookingBody } from "./booking-route-parts";

export const dynamic = "force-dynamic";

/**
 * A Project's bookings, newest first (CM-1006): by status (On Hold, Hold
 * expired, Booked, Cancelled — Hold expired is On Hold past its Hold until
 * date on the Company's today), Wing, unit and a search on the customer
 * or the Referred By name; cursor pages and the total. Needs Booking read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireSalesProjectAccess(
      request,
      BOOKING_MENU,
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionSalesBookingsRequestModel.safeParse(query),
    );
    const page = await bookingHandlers.list(session.access, {
      projectId: model.projectId,
      statuses: model.status,
      wingId: model.wingId,
      unitId: model.unitId,
      search: model.search,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionSalesBookingsResponse = {
      items: page.items.map((item) =>
        toBookingResponse(item, bookingActions(session.access, item)),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * **Hold** or **Book** a unit (CM-1006, ADR CM-0022 §7). One active
 * booking per unit: 409 `UNIT_BOOKED` while another holds it (a hold past
 * its Hold until date is cancelled instead, "Hold expired"), 409
 * `UNIT_UNAVAILABLE` for a unit not for sale, 404 `UNIT_NOT_FOUND` for a
 * unit that is not a live unit of the Project. The Booking Date is not
 * after today and inside the back-dated window. Needs Booking create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireSalesProjectAccess(
      request,
      BOOKING_MENU,
      "create",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionSalesBookingRequestModel.safeParse(raw),
    );
    const id = await bookingHandlers.create(session.access, model);
    return Response.json(await bookingBody(session.access, id), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
