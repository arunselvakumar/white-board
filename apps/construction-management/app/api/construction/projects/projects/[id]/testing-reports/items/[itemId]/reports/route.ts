import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { projectTestingReports } from "../../../handlers";
import {
  ConstructionProjectsTestingItemParamsModel,
  CreateConstructionProjectsTestingReportRequestModel,
  ListConstructionProjectsTestingReportsQueryModel,
  type ListConstructionProjectsTestingReportsResponseModel,
} from "../../../testing-report-models";
import {
  toTestingItemListItem,
  toTestingReportResponse,
} from "../../../testing-report-responses";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; itemId: string }> };

/**
 * A page of a testing item's reports (CM-409), newest report date first,
 * searched by name, with cursors both ways and the total. The cursor is
 * the report date (as `createdAt` of the kernel's cursor) and the id.
 */
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "read",
    );
    if (isResponse(session)) return session;
    const { id, itemId } = parseOrThrow(
      ConstructionProjectsTestingItemParamsModel.safeParse(
        await context.params,
      ),
    );
    const query = parseOrThrow(
      ListConstructionProjectsTestingReportsQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await projectTestingReports.reports({
      viewer: session.access,
      projectId: id,
      itemId,
      q: query.q,
      limit: query.limit,
      after: query.after == null ? undefined : decodeListCursor(query.after),
      before: query.before == null ? undefined : decodeListCursor(query.before),
    });
    const cursorOf = (report: { reportDate: string; id: string }) =>
      encodeListCursor({
        createdAt: calendarDateToDb(report.reportDate),
        id: report.id,
      });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = query.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : query.after != null;
    const body: ListConstructionProjectsTestingReportsResponseModel = {
      item: toTestingItemListItem(page.item),
      items: page.items.map(toTestingReportResponse),
      nextCursor: moreAfter && last != null ? cursorOf(last) : null,
      prevCursor: moreBefore && first != null ? cursorOf(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Finishes adding a report (CM-409): its details and the uploaded file at
 * `key`. 201 for a new report, 200 when the key was already recorded.
 * 403 under the back-dated policy for Material Testing Report.
 */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "create",
    );
    if (isResponse(session)) return session;
    const { id, itemId } = parseOrThrow(
      ConstructionProjectsTestingItemParamsModel.safeParse(
        await context.params,
      ),
    );
    const body = parseOrThrow(
      CreateConstructionProjectsTestingReportRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { report, created } = await projectTestingReports.addReport({
      viewer: session.access,
      projectId: id,
      itemId,
      details: {
        name: body.name,
        reportDate: body.reportDate,
        remark: body.remark ?? null,
      },
      key: body.key,
      fileName: body.fileName,
      by: session.userId,
    });
    return Response.json(toTestingReportResponse(report), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
