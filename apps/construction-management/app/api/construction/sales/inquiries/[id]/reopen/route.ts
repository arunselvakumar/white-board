import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { inquiryActions } from "@/src/sales/application/inquiry-handlers";

import {
  inquiryHandlers as handlers,
  requireInquiryAccess,
} from "../../handlers";
import {
  ConstructionSalesInquiryParamsModel,
  ReopenConstructionSalesInquiryRequestModel,
  toInquiryDetailResponse,
} from "../../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * Reopens a Converted or Lost inquiry at the stage it had (CM-1007; Inquiry update). 409 `INQUIRY_BOOKING_ACTIVE` while a Converted inquiry's booking is On Hold or Booked.
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
      ReopenConstructionSalesInquiryRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.reopen(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    const inquiry = await handlers.get(session.access, id);
    return Response.json(
      toInquiryDetailResponse(inquiry, inquiryActions(session.access, inquiry)),
    );
  } catch (error) {
    return mapError(error);
  }
}
