import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import { vendorHandlers as handlers } from "../../handlers";
import { toVendorResponse } from "../../vendor-models";
import { ConstructionLabourVendorParamsModel } from "../vendor-params-model";

export const dynamic = "force-dynamic";

/** Deactivates a Vendor: it leaves the attendance pickers; its records stay (CM-209). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.vendors", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionLabourVendorParamsModel.safeParse(await context.params),
    );
    const vendor = await handlers.setActive({
      workspaceId: session.workspaceId,
      id,
      isActive: false,
      by: session.userId,
    });
    return Response.json(
      toVendorResponse(
        vendor,
        can(session.access, "masters.vendors", "financial"),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
