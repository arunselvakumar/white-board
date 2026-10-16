import { StatusCodes } from "http-status-codes";

import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";

import { companyDeletionHandlers } from "../handlers";

export const dynamic = "force-dynamic";

/** Cancels the pending deletion (Owner only). 409 `NO_COMPANY_DELETION`. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    await companyDeletionHandlers.cancel({
      workspaceId: session.workspaceId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
