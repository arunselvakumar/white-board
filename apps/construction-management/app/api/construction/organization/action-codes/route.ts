import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
  requireOwnerSession,
  requireUserSession,
} from "@/app/api/_lib/require-session";
import { sendActionCode } from "@/src/shared-kernel/action-codes";

import { RequestConstructionOrganizationActionCodeRequestModel } from "./action-code-models";

export const dynamic = "force-dynamic";

/**
 * Sends the signed-in User a new six-digit code for `purpose`: by SMS
 * while SMS is on and they sign in by mobile, otherwise to their sign-in
 * email (ADR CM-0009). One per purpose per minute (429
 * `ACTION_CODE_TOO_SOON`); 10 minutes, five tries, once. Company purposes
 * are tied to the Active Company; `reveal_identifiers` to this session.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const { purpose } = parseOrThrow(
      RequestConstructionOrganizationActionCodeRequestModel.safeParse(
        await request.json(),
      ),
    );
    if (purpose === "delete_account") {
      const session = await requireUserSession(request);
      if (isResponse(session)) return session;
      await sendActionCode({ user: session.user, purpose });
      return new Response(null, { status: StatusCodes.NO_CONTENT });
    }
    const session =
      purpose === "reveal_identifiers"
        ? await requireCompanySession(request)
        : await requireOwnerSession(request);
    if (isResponse(session)) return session;
    await sendActionCode({
      user: session.user,
      purpose,
      workspaceId: session.workspaceId,
      sessionId: session.sessionId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
