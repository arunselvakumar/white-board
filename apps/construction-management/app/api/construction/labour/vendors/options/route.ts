import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import { vendorHandlers as handlers } from "../handlers";
import { toVendorOptionResponse } from "../vendor-models";
import { ListConstructionLabourVendorOptionsRequestModel } from "./list-vendor-options-request-model";
import type { ListConstructionLabourVendorOptionsResponseModel } from "./list-vendor-options-response-model";

export const dynamic = "force-dynamic";

/**
 * Active vendors assigned to a Project, by name, with their live shifts and
 * category rates, for vendor attendance (CM-213). Needs Attendance read on
 * that Project; rates are null without Vendor (`labour.vendor`) Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionLabourVendorOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const items = await handlers.options(session.workspaceId, model.projectId);
    const financial = can(session.access, "labour.vendor", "financial", {
      projectId: model.projectId,
    });
    const body: ListConstructionLabourVendorOptionsResponseModel = {
      items: items.map((item) => toVendorOptionResponse(item, financial)),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
