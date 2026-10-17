import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { toActivityResponse } from "../../activity-models";
import {
  inquiryActivityHandlers as handlers,
  requireInquiryAccess,
} from "../../handlers";
import { ConstructionSalesInquiryParamsModel } from "../../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * The inquiry's timeline, newest first (CM-1004): its follow-ups merged
 * with its history. Inquiry read; View all as the inquiry.
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
    return Response.json(
      toActivityResponse(await handlers.activity(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
