import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBillingAddressHandlers } from "@/src/organization/infrastructure/create-billing-address-handlers";

import {
  ConstructionOrganizationBillingAddressParamsModel,
  mapBillingAddress,
  type ConstructionOrganizationBillingAddressResponseModel,
} from "../billing-address-models";

export const dynamic = "force-dynamic";

const handlers = createBillingAddressHandlers();

/** One live billing address; 404 BILLING_ADDRESS_NOT_FOUND otherwise (CM-501). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "read",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationBillingAddressParamsModel.safeParse(
        await context.params,
      ),
    );
    const body: ConstructionOrganizationBillingAddressResponseModel =
      mapBillingAddress(await handlers.get(session.workspaceId, id));
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
