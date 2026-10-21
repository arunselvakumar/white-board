import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { inquiryActions } from "@/src/sales/application/inquiry-handlers";

import {
  inquiryHandlers as handlers,
  requireInquiryAccess,
} from "../../handlers";
import {
  ConstructionSalesInquiryParamsModel,
  toInquiryDetailResponse,
  toInquiryWriteInput,
  UpdateConstructionSalesInquiryRequestModel,
} from "../../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * Edits an inquiry (CM-1003; Inquiry update on its Project). A field left
 * out keeps what is stored; `null` clears it. 409
 * `INQUIRY_CHANGED` when `expectedUpdatedAt` is stale; 409
 * `INQUIRY_DUPLICATE` when a changed mobile or email matches another live
 * inquiry, unless `allowDuplicate`. The back-dated window applies to the
 * old Inquiry Date and, when it changes, the new one.
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
      UpdateConstructionSalesInquiryRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(session.access, id, new Date(model.expectedUpdatedAt), {
      ...toInquiryWriteInput(model),
      allowDuplicate: model.allowDuplicate,
    });
    const inquiry = await handlers.get(session.access, id);
    return Response.json(
      toInquiryDetailResponse(inquiry, inquiryActions(session.access, inquiry)),
    );
  } catch (error) {
    return mapError(error);
  }
}
