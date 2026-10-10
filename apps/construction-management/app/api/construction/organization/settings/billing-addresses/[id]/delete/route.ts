import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBillingAddressHandlers } from "@/src/organization/infrastructure/create-billing-address-handlers";

import { ConstructionOrganizationBillingAddressParamsModel } from "../../billing-address-models";

export const dynamic = "force-dynamic";

const handlers = createBillingAddressHandlers();

/**
 * Deletes a billing address (a tombstone; Purchase Orders keep their copy).
 * Deleting the default makes the oldest remaining address the default (CM-501).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationBillingAddressParamsModel.safeParse(
        await context.params,
      ),
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
