import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";

import { notifications } from "../../handlers";

export const dynamic = "force-dynamic";

/** Marks every unread notification of the member's, in the Active Company, read. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    return Response.json(await notifications.markAllRead(session));
  } catch (error) {
    return mapError(error);
  }
}
