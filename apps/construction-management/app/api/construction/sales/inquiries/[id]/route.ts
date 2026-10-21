import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { inquiryActions } from "@/src/sales/application/inquiry-handlers";

import { inquiryHandlers as handlers, requireInquiryAccess } from "../handlers";
import {
  ConstructionSalesInquiryParamsModel,
  toInquiryDetailResponse,
} from "../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * One inquiry with its history (Inquiry read on its Project; without View
 * all, only one the caller created, is the Assignee or Lead Owner of — 404
 * otherwise).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSalesInquiryParamsModel.safeParse(await context.params),
    );
    const session = await requireInquiryAccess(request, id, "read");
    if (isResponse(session)) return session;
    const inquiry = await handlers.get(session.access, id);
    return Response.json(
      toInquiryDetailResponse(inquiry, inquiryActions(session.access, inquiry)),
    );
  } catch (error) {
    return mapError(error);
  }
}
