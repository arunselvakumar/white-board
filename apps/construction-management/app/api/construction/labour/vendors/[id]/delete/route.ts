import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { vendorHandlers as handlers } from "../../handlers";
import { ConstructionLabourVendorParamsModel } from "../vendor-params-model";

export const dynamic = "force-dynamic";

/**
 * Deletes a Vendor (a tombstone) and reverses its opening entry (CM-209).
 * 409 `VENDOR_HAS_RECORDS` once it has attendance or wage payments.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.vendors", "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionLabourVendorParamsModel.safeParse(await context.params),
    );
    await handlers.delete({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
