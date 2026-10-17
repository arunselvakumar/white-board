import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inquiryHandlers as handlers,
  requireInquiryAccess,
} from "../../handlers";
import {
  ConstructionSalesInquiryParamsModel,
  DeleteConstructionSalesInquiryRequestModel,
} from "../../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * Deletes an inquiry (a tombstone; Inquiry delete on its Project). 409
 * `INQUIRY_HAS_BOOKING` for a Converted inquiry whose booking is still On
 * Hold or Booked; the back-dated edit window applies to its Inquiry Date.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSalesInquiryParamsModel.safeParse(await context.params),
    );
    const session = await requireInquiryAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionSalesInquiryRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
