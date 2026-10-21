import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionSalesFollowUpParamsModel } from "../../../../activity-models";
import {
  inquiryActivityHandlers as handlers,
  requireInquiryAccess,
} from "../../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Removes a follow-up entered by mistake (CM-1004; Inquiry delete): a
 * tombstone, audited. The inquiry's next follow-up does not change.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; followUpId: string }> },
): Promise<Response> {
  try {
    const { id, followUpId } = parseOrThrow(
      ConstructionSalesFollowUpParamsModel.safeParse(await context.params),
    );
    const session = await requireInquiryAccess(request, id, "delete");
    if (isResponse(session)) return session;
    await handlers.deleteFollowUp(session.access, id, followUpId);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
