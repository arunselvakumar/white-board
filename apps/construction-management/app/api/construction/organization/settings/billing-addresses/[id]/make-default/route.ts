import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBillingAddressHandlers } from "@/src/organization/infrastructure/create-billing-address-handlers";

import {
  ConstructionOrganizationBillingAddressParamsModel,
  mapBillingAddress,
  type ConstructionOrganizationBillingAddressResponseModel,
} from "../../billing-address-models";

export const dynamic = "force-dynamic";

const handlers = createBillingAddressHandlers();

/** Makes this the Company's default billing address (CM-501). */
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
    const body: ConstructionOrganizationBillingAddressResponseModel =
      mapBillingAddress(
        await handlers.makeDefault({
          workspaceId: session.workspaceId,
          id,
          by: session.userId,
        }),
      );
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
