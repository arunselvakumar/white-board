import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  clientBillHandlers,
  requestProjectId,
  requireClientBillProjectAccess,
} from "./client-bill-access";
import {
  CreateConstructionContractsClientBillRequestModel,
  decodeClientBillCursor,
  encodeClientBillCursor,
  ListConstructionContractsClientBillsRequestModel,
  toClientBillResponse,
  toClientBillSetupResponse,
  toClientBillSummaryResponse,
  toClientBillTotalsResponse,
  type ListConstructionContractsClientBillsResponseModel,
} from "./client-bill-models";

export const dynamic = "force-dynamic";

/**
 * The Project's Client Bills, newest first, by status or bill date
 * (CM-1107), with the totals of what the filter matches (draft, pending
 * and approved), the retention receivable and what the Project still
 * needs before it can be billed. Money is null without Financial. Needs
 * Client Bill read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireClientBillProjectAccess(
      request,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsClientBillsRequestModel.safeParse(raw),
    );
    const page = await clientBillHandlers.list(session.access, projectId, {
      status: model.status,
      from: model.from,
      to: model.to,
      limit: model.limit,
      after:
        model.after == null ? undefined : decodeClientBillCursor(model.after),
      before:
        model.before == null ? undefined : decodeClientBillCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionContractsClientBillsResponseModel = {
      items: page.items.map((item) =>
        toClientBillSummaryResponse(item, page.financial),
      ),
      nextCursor:
        moreAfter && last != null ? encodeClientBillCursor(last) : null,
      prevCursor:
        moreBefore && first != null ? encodeClientBillCursor(first) : null,
      total: page.total,
      totals: toClientBillTotalsResponse(page.totals, page.financial),
      retentionReceivable: page.financial
        ? Number(page.retentionReceivable)
        : null,
      setup: toClientBillSetupResponse(page.setup),
      financial: page.financial,
      viewerFlags: page.viewerFlags,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Drafts a Client Bill (CM-1107) on a Contract work Project with a Client
 * and a state (400 PROJECT_NOT_CONTRACT_WORK, PROJECT_CLIENT_REQUIRED,
 * PROJECT_STATE_REQUIRED): every checked client-side row measured up to
 * the date and not yet billed (400 BILL_NO_MEASUREMENTS when none), one
 * draft or pending bill per Project (409 BILL_OPEN_EXISTS). Billing past
 * the BOQ quantity is allowed and marked as a deviation. Needs Client Bill
 * create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const projectId = requestProjectId(body);
    const session = await requireClientBillProjectAccess(
      request,
      "create",
      projectId,
    );
    if (isResponse(session)) return session;
    const { projectId: _projectId, ...input } = parseOrThrow(
      CreateConstructionContractsClientBillRequestModel.safeParse(body),
    );
    const bill = await clientBillHandlers.create(
      session.access,
      projectId,
      input,
    );
    const detail = await clientBillHandlers.get(session.access, bill.id);
    return Response.json(toClientBillResponse(detail), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
