import { DomainError } from "@/src/shared-kernel/domain-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";
import { createSubscriptionHandlers } from "@/src/organization/infrastructure/create-subscription-handlers";
import { isUuid } from "@/src/shared-kernel/ids";

import { ListConstructionOrganizationInvoicesRequestModel } from "./list-invoices-request-model";
import type { ListConstructionOrganizationInvoicesResponseModel } from "./list-invoices-response-model";

export const dynamic = "force-dynamic";

const handlers = createSubscriptionHandlers();

type Cursor = { paidAt: Date; id: string };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify([cursor.paidAt.toISOString(), cursor.id]),
  ).toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (value == null) return undefined;
  try {
    const [paidAt, id] = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as [string, string];
    const date = new Date(paidAt);
    if (!Number.isNaN(date.getTime()) && isUuid(id))
      return { paidAt: date, id };
  } catch {
    // Falls through to the error below.
  }
  throw new DomainError("CURSOR_INVALID", "This page link is not valid.");
}

/** Paid subscription orders, newest first (CM-117). Owner only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionOrganizationInvoicesRequestModel.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        after: url.searchParams.get("after") ?? undefined,
        before: url.searchParams.get("before") ?? undefined,
      }),
    );
    const after = decodeCursor(model.after);
    const before = decodeCursor(model.before);
    const page = await handlers.invoices({
      workspaceId: session.workspaceId,
      limit: model.limit,
      ...(after == null ? {} : { after }),
      ...(before == null ? {} : { before }),
    });
    const cursorOf = (index: number): string | null => {
      const item = page.items[index];
      return item?.paidAt == null
        ? null
        : encodeCursor({ paidAt: item.paidAt, id: item.id });
    };
    const backwards = before != null;
    const hasOlder = backwards ? true : page.hasMore;
    const hasNewer = backwards ? page.hasMore : after != null;
    const body: ListConstructionOrganizationInvoicesResponseModel = {
      items: page.items.map((order) => ({
        id: order.id,
        invoiceNumber: order.invoiceNumber ?? "",
        kind: order.quote.kind,
        planName: order.quote.planName,
        months: order.quote.months,
        paidAt: (order.paidAt ?? order.createdAt).toISOString(),
        totalPaise: order.quote.total,
        currency: order.quote.currency,
        pdfPath: `/api/construction/organization/subscription/invoices/${order.id}/pdf`,
      })),
      nextCursor: hasOlder ? cursorOf(page.items.length - 1) : null,
      prevCursor: hasNewer ? cursorOf(0) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
