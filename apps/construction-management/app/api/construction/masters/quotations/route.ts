import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { partyQuotations } from "../_lib/quotation-handlers";
import {
  ListConstructionMastersQuotationsQueryModel,
  toQuotationResponse,
} from "../_lib/quotation-models";

export const dynamic = "force-dynamic";

/**
 * View Quotations (CM-501, menu `masters.quotations` read): every live
 * Contractor's and Supplier's quotation files, newest first, with the
 * party and the date.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.quotations", "read");
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      ListConstructionMastersQuotationsQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await partyQuotations.list({
      workspaceId: session.workspaceId,
      limit: query.limit,
      after: query.after == null ? undefined : decodeListCursor(query.after),
      before: query.before == null ? undefined : decodeListCursor(query.before),
      partyKind: query.partyKind,
      search: query.q,
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = query.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : query.after != null;
    return Response.json({
      items: page.items.map(toQuotationResponse),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    });
  } catch (error) {
    return mapError(error);
  }
}
