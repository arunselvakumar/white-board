import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { verifyActionCode } from "@/src/shared-kernel/action-codes";

import { VerifyConstructionOrganizationActionCodeRequestModel } from "../action-code-models";

export const dynamic = "force-dynamic";

/**
 * Checks a `reveal_identifiers` code: once verified, this session may
 * reveal full Aadhaar and PAN numbers for 10 minutes (ADR CM-0021 §11).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      VerifyConstructionOrganizationActionCodeRequestModel.safeParse(
        await request.json(),
      ),
    );
    await verifyActionCode({
      userId: session.userId,
      purpose: body.purpose,
      code: body.code,
      workspaceId: session.workspaceId,
      sessionId: session.sessionId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
