import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { CreateConstructionLabourVendorRequestModel } from "./create-vendor-request-model";
import { vendorHandlers as handlers } from "./handlers";
import { ListConstructionLabourVendorsRequestModel } from "./list-vendors-request-model";
import type { ListConstructionLabourVendorsResponseModel } from "./list-vendors-response-model";
import { toVendorResponse, toVendorSummaryResponse } from "./vendor-models";

export const dynamic = "force-dynamic";

/**
 * The Vendor register, newest first, with search, Project and active
 * filters (CM-209). Balances are null without the Financial flag.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.vendors", "read");
    if (isResponse(session)) return session;
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionLabourVendorsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
      search: model.q,
      projectId: model.projectId,
      isActive: model.active == null ? undefined : model.active === "true",
    });
    const financial = can(session.access, "masters.vendors", "financial");
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionLabourVendorsResponseModel = {
      items: page.items.map((item) => toVendorSummaryResponse(item, financial)),
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
 * Add Vendor with Projects, rate card and opening balance (CM-208). The
 * opening balance is posted to the ledger in the same transaction.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.vendors", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionLabourVendorRequestModel.safeParse(
        await request.json(),
      ),
    );
    const financial = can(session.access, "masters.vendors", "financial");
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      details: {
        name: model.name,
        joiningDate: model.joiningDate,
        contactNumber: model.contactNumber,
        address: model.address,
      },
      projectIds: model.projectIds,
      shifts: model.shifts,
      openingBalance: model.openingBalance ?? null,
      by: session.userId,
    });
    return Response.json(toVendorResponse(created, financial), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
