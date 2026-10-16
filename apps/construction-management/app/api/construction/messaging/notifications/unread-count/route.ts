import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";

import { notifications } from "../../handlers";
import {
  toNotificationResponse,
  type GetConstructionMessagingUnreadCountResponseModel,
} from "../../messaging-models";

export const dynamic = "force-dynamic";

/**
 * The bell's unread count, and the newest unread "ready" notification of
 * the last hour (report, backup, export) for the Download toast. The app
 * polls it every 30 seconds, every 3 while a report is running.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const unread = await notifications.unread(session);
    const body: GetConstructionMessagingUnreadCountResponseModel = {
      count: unread.count,
      latestReadyDownload:
        unread.latestReadyDownload == null
          ? null
          : toNotificationResponse(unread.latestReadyDownload),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
