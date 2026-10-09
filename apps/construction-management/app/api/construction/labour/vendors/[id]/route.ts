import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import { vendorHandlers as handlers } from "../handlers";
import { toVendorResponse } from "../vendor-models";
import { ConstructionLabourVendorParamsModel } from "./vendor-params-model";

export const dynamic = "force-dynamic";

/** One Vendor with Projects, rate card, opening balance and balance (CM-209). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.vendors", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionLabourVendorParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toVendorResponse(
        await handlers.get(session.workspaceId, id),
        can(session.access, "masters.vendors", "financial"),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
