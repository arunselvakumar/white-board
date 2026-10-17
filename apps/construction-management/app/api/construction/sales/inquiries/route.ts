import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { inquiryActions } from "@/src/sales/application/inquiry-handlers";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { INQUIRY_MENU, inquiryHandlers as handlers } from "./handlers";
import {
  CreateConstructionSalesInquiryRequestModel,
  ListConstructionSalesInquiriesRequestModel,
  toInquiryDetailResponse,
  toInquiryResponse,
  toInquiryWriteInput,
  type ListConstructionSalesInquiriesResponse,
} from "./inquiry-models";

export const dynamic = "force-dynamic";

/**
 * A Project's inquiries, newest first (CM-1003): by status, Funnel Stage,
 * Interest Type, Lead Source, Assignee, Due (Overdue / Today / Upcoming /
 * None on the Company's clock) and a search on the name, mobile or email.
 * Without View all, only those the caller created, is the Assignee or Lead
 * Owner of. Needs Inquiry read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireSalesProjectAccess(
      request,
      INQUIRY_MENU,
      "read",
      requestProjectId(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionSalesInquiriesRequestModel.safeParse(query),
    );
    const page = await handlers.list(session.access, {
      projectId: model.projectId,
      statuses: model.status,
      funnelStageId: model.funnelStageId,
      interestTypes: model.interestType,
      leadSourceId: model.leadSourceId,
      assigneeMemberId: model.assigneeMemberId,
      due: model.due,
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
    const body: ListConstructionSalesInquiriesResponse = {
      items: page.items.map((item) =>
        toInquiryResponse(item, inquiryActions(session.access, item)),
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
 * Adds an inquiry (CM-1003): the full form and quick add are this one
 * command. Open at the first Funnel Stage unless another is picked;
 * Assignee and Lead Owner default to the caller when on the Project. 409
 * `INQUIRY_DUPLICATE` (with `details.matches`) when another live inquiry
 * of the Project has the mobile or email, unless `allowDuplicate`. Needs
 * Inquiry create on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireSalesProjectAccess(
      request,
      INQUIRY_MENU,
      "create",
      requestProjectId(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionSalesInquiryRequestModel.safeParse(raw),
    );
    const id = await handlers.create(session.access, {
      ...toInquiryWriteInput(model),
      projectId: model.projectId,
      allowDuplicate: model.allowDuplicate,
    });
    const inquiry = await handlers.get(session.access, id);
    return Response.json(
      toInquiryDetailResponse(inquiry, inquiryActions(session.access, inquiry)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
