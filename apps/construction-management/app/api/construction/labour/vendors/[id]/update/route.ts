import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import { vendorHandlers as handlers } from "../../handlers";
import { toVendorResponse } from "../../vendor-models";
import { ConstructionLabourVendorParamsModel } from "../vendor-params-model";
import { UpdateConstructionLabourVendorRequestModel } from "./update-vendor-request-model";

export const dynamic = "force-dynamic";

/**
 * Edit Vendor (CM-209): details, Projects and the whole rate card in one
 * command. Rates are replaced in place (attendance keeps its snapshots);
 * a removed shift is soft-deleted. A changed opening balance or joining
 * date reverses the opening entry and posts the new one.
 */
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
    const model = parseOrThrow(
      UpdateConstructionLabourVendorRequestModel.safeParse(
        await request.json(),
      ),
    );
    const financial = can(session.access, "masters.vendors", "financial");
    const updated = await handlers.update({
      workspaceId: session.workspaceId,
      id,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
      details: {
        name: model.name,
        joiningDate: model.joiningDate,
        contactNumber: model.contactNumber,
        address: model.address,
      },
      projectIds: model.projectIds,
      shifts: model.shifts,
      openingBalance: model.openingBalance ?? null,
      by: session.userId,
    });
    return Response.json(toVendorResponse(updated, financial));
  } catch (error) {
    return mapError(error);
  }
}
