import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/tracking/project-scope";
import { requireTrackingProjectAccess } from "@/app/api/construction/tracking/tracking-access";
import { issueActions } from "@/src/tracking/application/issue-handlers";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { ISSUE_MENU, issueHandlers as handlers } from "./handlers";
import {
  CreateConstructionTrackingIssueRequestModel,
  ListConstructionTrackingIssuesRequestModel,
  toIssueDetailResponse,
  toIssueResponse,
  type ListConstructionTrackingIssuesResponse,
} from "./issue-models";

export const dynamic = "force-dynamic";

/**
 * A Project's Issues & Snags, newest first (CM-803): by status (Pending /
 * Delayed / Solved / Closed, Delayed derived on the Company's today),
 * priority, category, assignee, Department, Contractor, location, an Issue
 * Date range and a search on the number or details. Without View all, only
 * the issues the caller created or is assigned to. Needs Issues and snags
 * read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireTrackingProjectAccess(
      request,
      ISSUE_MENU,
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionTrackingIssuesRequestModel.safeParse(query),
    );
    const page = await handlers.list(session.access, {
      projectId: model.projectId,
      statuses: model.status,
      priorities: model.priority,
      categoryId: model.categoryId,
      assigneeMemberId: model.assigneeMemberId,
      departmentId: model.departmentId,
      contractorId: model.contractorId,
      locationType: model.locationType,
      placeId: model.placeId,
      from: model.from,
      to: model.to,
      search: model.search,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionTrackingIssuesResponse = {
      items: page.items.map((item) =>
        toIssueResponse(item, issueActions(session.access, item)),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Raises an issue (CM-803): **Save** creates it open; **Save & Mark As
 * Solved** (`markSolved`, needs Create and Update) creates it solved.
 * Numbered from the Issue & Snag rule on its Issue Date, which the
 * back-dated limit applies to. Needs Issues and snags create on the
 * Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireTrackingProjectAccess(
      request,
      ISSUE_MENU,
      "create",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionTrackingIssueRequestModel.safeParse(raw),
    );
    const id = await handlers.create(session.access, model);
    const issue = await handlers.get(session.access, id);
    return Response.json(
      toIssueDetailResponse(issue, issueActions(session.access, issue)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
