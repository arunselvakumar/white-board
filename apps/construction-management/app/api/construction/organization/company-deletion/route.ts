import { companies } from "@repo/auth/construction/server";
import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";

import {
  ScheduleConstructionOrganizationCompanyDeletionRequestModel,
  toDeletionResponse,
  type GetConstructionOrganizationCompanyDeletionResponseModel,
} from "./company-deletion-models";
import { companyDeletionHandlers } from "./handlers";

export const dynamic = "force-dynamic";

/** The Active Company's pending deletion, or null. Any member (the banner). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const pending = await companyDeletionHandlers.status(session.workspaceId);
    const body: GetConstructionOrganizationCompanyDeletionResponseModel = {
      deletion: pending == null ? null : toDeletionResponse(pending),
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Schedules the Company's deletion 30 days ahead (Owner only, the
 * Company's name typed, a `delete_company` code). Until then every write
 * answers 409 `COMPANY_DELETION_SCHEDULED`; reads, reports, backups and
 * exports stay open, and the Owner may cancel.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      ScheduleConstructionOrganizationCompanyDeletionRequestModel.safeParse(
        await request.json(),
      ),
    );
    const mine = await companies.listForUser(session.userId);
    const scheduled = await companyDeletionHandlers.schedule({
      workspaceId: session.workspaceId,
      by: session.userId,
      sessionId: session.sessionId,
      fallbackName:
        mine.find((item) => item.id === session.workspaceId)?.name ?? "",
      typedName: body.companyName,
      code: body.code,
    });
    return Response.json(toDeletionResponse(scheduled), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
