import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { inquiryActions } from "@/src/sales/application/inquiry-handlers";

import {
  inquiryHandlers as handlers,
  requireInquiryAccess,
} from "../../handlers";
import {
  ConstructionSalesInquiryParamsModel,
  ConvertConstructionSalesInquiryRequestModel,
  toInquiryDetailResponse,
} from "../../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * Closes an Open inquiry as Converted (CM-1007): one transaction books the unit (a Booked booking with the inquiry's name, mobile, email and address, linked to it) and closes the inquiry. Needs Inquiry update and Booking create (403 otherwise); the booking date is inside the back-dated `booking` window; 404 `UNIT_NOT_FOUND`, 409 `UNIT_UNAVAILABLE` / `UNIT_BOOKED` / `INQUIRY_NOT_OPEN` / `INQUIRY_CHANGED`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSalesInquiryParamsModel.safeParse(await context.params),
    );
    const session = await requireInquiryAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ConvertConstructionSalesInquiryRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.convert(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      { unitId: model.unitId, bookingDate: model.bookingDate },
    );
    const inquiry = await handlers.get(session.access, id);
    return Response.json(
      toInquiryDetailResponse(inquiry, inquiryActions(session.access, inquiry)),
    );
  } catch (error) {
    return mapError(error);
  }
}
