import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireReportSession } from "../reports/handlers";
import {
  decodeDownloadCursor,
  encodeDownloadCursor,
  ListConstructionReportingDownloadsRequestModel,
  type ConstructionReportingDownloadItemModel,
  type ListConstructionReportingDownloadsResponseModel,
} from "./download-models";
import { downloadSources } from "./download-sources";

export const dynamic = "force-dynamic";
/** A read heals a stuck report, which drains in `after()` (ADR CM-0021 §1). */
export const maxDuration = 300;

function newestFirst(
  a: ConstructionReportingDownloadItemModel,
  b: ConstructionReportingDownloadItemModel,
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Downloads (CM-901): the signed-in member's own report jobs (and, from
 * CM-906, backups and data exports) across every Project and central,
 * newest first, `limit` at a time. Only their own: the Owner sees theirs
 * too, not everyone's. Each row says what may be done with it now.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReportSession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionReportingDownloadsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const before =
      model.cursor == null ? null : decodeDownloadCursor(model.cursor);
    if (model.cursor != null && before == null)
      return jsonError(
        StatusCodes.BAD_REQUEST,
        "CURSOR_INVALID",
        "This page link is not valid; start from the first page.",
      );
    // One more than a page from each source tells whether another follows.
    const rows = (
      await Promise.all(
        downloadSources().map((source) =>
          source.list(session, { before, limit: model.limit + 1 }),
        ),
      )
    )
      .flat()
      .sort(newestFirst);
    const items = rows.slice(0, model.limit);
    const last = items.at(-1);
    const body: ListConstructionReportingDownloadsResponseModel = {
      items,
      nextCursor:
        rows.length > model.limit && last != null
          ? encodeDownloadCursor({
              createdAt: new Date(last.createdAt),
              id: last.id,
            })
          : null,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
