import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBillingAddressHandlers } from "@/src/organization/infrastructure/create-billing-address-handlers";

import {
  CreateConstructionOrganizationBillingAddressRequestModel,
  mapBillingAddress,
  type ConstructionOrganizationBillingAddressResponseModel,
  type ListConstructionOrganizationBillingAddressesResponseModel,
} from "./billing-address-models";

export const dynamic = "force-dynamic";

const handlers = createBillingAddressHandlers();

/** The Company's billing addresses, the default first (CM-501). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "read",
    );
    if (isResponse(session)) return session;
    const addresses = await handlers.list(session.workspaceId);
    const body: ListConstructionOrganizationBillingAddressesResponseModel = {
      items: addresses.map(mapBillingAddress),
      total: addresses.length,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a billing address; the Company's first one becomes the default (CM-501). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "create",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionOrganizationBillingAddressRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      details: model,
      by: session.userId,
    });
    const body: ConstructionOrganizationBillingAddressResponseModel =
      mapBillingAddress(created);
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
