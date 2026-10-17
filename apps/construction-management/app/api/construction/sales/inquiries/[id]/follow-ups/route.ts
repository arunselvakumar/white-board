import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { inquiryActions } from "@/src/sales/application/inquiry-handlers";

import {
  AddConstructionSalesFollowUpRequestModel,
  toFollowUpInput,
} from "../../activity-models";
import {
  inquiryActivityHandlers,
  inquiryHandlers,
  requireInquiryAccess,
} from "../../handlers";
import {
  ConstructionSalesInquiryParamsModel,
  toInquiryDetailResponse,
} from "../../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * Records a follow-up on an Open inquiry (CM-1004; Inquiry update): it
 * sets the inquiry's next follow-up and, with `toStageId`, its stage.
 * 409 `INQUIRY_NOT_OPEN`; 400 `FOLLOW_UP_IN_FUTURE`,
 * `NEXT_FOLLOW_UP_BEFORE_DONE`; 403 outside the back-dated window
 * `inquiry_follow_up`. Answers with the inquiry.
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
      AddConstructionSalesFollowUpRequestModel.safeParse(await request.json()),
    );
    await inquiryActivityHandlers.addFollowUp(
      session.access,
      id,
      toFollowUpInput(model),
    );
    const inquiry = await inquiryHandlers.get(session.access, id);
    return Response.json(
      toInquiryDetailResponse(inquiry, inquiryActions(session.access, inquiry)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
