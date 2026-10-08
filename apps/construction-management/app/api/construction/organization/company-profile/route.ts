import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";
import { createCompanyProfileHandlers } from "@/src/organization/infrastructure/create-company-profile-handlers";

import type { GetConstructionOrganizationCompanyProfileResponseModel } from "./get-company-profile-response-model";

export const dynamic = "force-dynamic";

const handlers = createCompanyProfileHandlers();

/** The Active Company's profile. Owner-only until the Permission Matrix exists (CM-107). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const profile = await handlers.get.execute({
      workspaceId: session.workspaceId,
    });
    const body: GetConstructionOrganizationCompanyProfileResponseModel = {
      id: profile.id,
      gstin: profile.gstin,
      pan: profile.pan,
      address: profile.address,
      currency: profile.currency,
      isIndian: profile.isIndian,
      timezone: profile.timezone,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
