import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBillingAddressHandlers } from "@/src/organization/infrastructure/create-billing-address-handlers";

import {
  ConstructionOrganizationBillingAddressParamsModel,
  UpdateConstructionOrganizationBillingAddressRequestModel,
  mapBillingAddress,
  type ConstructionOrganizationBillingAddressResponseModel,
} from "../../billing-address-models";

export const dynamic = "force-dynamic";

const handlers = createBillingAddressHandlers();

/** Changes a billing address; Purchase Orders already saved keep their copy (CM-501). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "update",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationBillingAddressParamsModel.safeParse(
        await context.params,
      ),
    );
    const { expectedUpdatedAt, ...details } = parseOrThrow(
      UpdateConstructionOrganizationBillingAddressRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await handlers.update({
      workspaceId: session.workspaceId,
      id,
      details,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      by: session.userId,
    });
    const body: ConstructionOrganizationBillingAddressResponseModel =
      mapBillingAddress(updated);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
