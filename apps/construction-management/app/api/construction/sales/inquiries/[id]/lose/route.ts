import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { inquiryActions } from "@/src/sales/application/inquiry-handlers";

import {
  inquiryHandlers as handlers,
  requireInquiryAccess,
} from "../../handlers";
import {
  ConstructionSalesInquiryParamsModel,
  LoseConstructionSalesInquiryRequestModel,
  toInquiryDetailResponse,
} from "../../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * Closes an Open inquiry as Lost with an enabled Lost Reason and optional remarks (CM-1007; Inquiry update).
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
      LoseConstructionSalesInquiryRequestModel.safeParse(await request.json()),
    );
    await handlers.lose(session.access, id, new Date(model.expectedUpdatedAt), {
      lostReasonId: model.lostReasonId,
      remarks: model.remarks,
    });
    const inquiry = await handlers.get(session.access, id);
    return Response.json(
      toInquiryDetailResponse(inquiry, inquiryActions(session.access, inquiry)),
    );
  } catch (error) {
    return mapError(error);
  }
}
