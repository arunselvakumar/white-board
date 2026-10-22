import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  contractorBillHandlers,
  requestProjectId,
  requireContractorBillProjectAccess,
} from "./contractor-bill-access";
import {
  CreateConstructionContractsContractorBillRequestModel,
  decodeContractorBillCursor,
  encodeContractorBillCursor,
  ListConstructionContractsContractorBillsRequestModel,
  toContractorBillResponse,
  toContractorBillSummaryResponse,
  toTotalsResponse,
  type ListConstructionContractsContractorBillsResponseModel,
} from "./contractor-bill-models";

export const dynamic = "force-dynamic";

/**
 * The Project's Contractor Bills, newest first, by status, Work Order,
 * Contractor or bill date (CM-1106), with the totals of what the filter
 * matches (draft, pending and approved) and the retention held per
 * Contractor. Money is null without Financial. Needs Contractor Bill read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireContractorBillProjectAccess(
      request,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsContractorBillsRequestModel.safeParse(raw),
    );
    const page = await contractorBillHandlers.list(session.access, projectId, {
      status: model.status,
      workOrderId: model.workOrderId,
      contractorId: model.contractorId,
      from: model.from,
      to: model.to,
      limit: model.limit,
      after:
        model.after == null
          ? undefined
          : decodeContractorBillCursor(model.after),
      before:
        model.before == null
          ? undefined
          : decodeContractorBillCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionContractsContractorBillsResponseModel = {
      items: page.items.map((item) =>
        toContractorBillSummaryResponse(item, page.financial),
      ),
      nextCursor:
        moreAfter && last != null ? encodeContractorBillCursor(last) : null,
      prevCursor:
        moreBefore && first != null ? encodeContractorBillCursor(first) : null,
      total: page.total,
      totals: toTotalsResponse(page.totals, page.financial),
      retentionHeld: page.financial
        ? page.retentionHeld.map((row) => ({
            contractorId: row.contractorId,
            contractorName: row.contractorName,
            amount: Number(row.amount),
          }))
        : [],
      financial: page.financial,
      viewerFlags: page.viewerFlags,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Drafts a Contractor Bill on an issued Work Order (CM-1106): every
 * checked row measured up to the date and not yet billed (400
 * BILL_NO_MEASUREMENTS when none), one draft or pending bill per Work
 * Order (409 BILL_OPEN_EXISTS), 409 WORK_ORDER_QUANTITY_EXCEEDED past a
 * line's quantity. Needs Contractor Bill create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const projectId = requestProjectId(body);
    const session = await requireContractorBillProjectAccess(
      request,
      "create",
      projectId,
    );
    if (isResponse(session)) return session;
    const { projectId: _projectId, ...input } = parseOrThrow(
      CreateConstructionContractsContractorBillRequestModel.safeParse(body),
    );
    const bill = await contractorBillHandlers.create(
      session.access,
      projectId,
      input,
    );
    const detail = await contractorBillHandlers.get(session.access, bill.id);
    return Response.json(toContractorBillResponse(detail), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
