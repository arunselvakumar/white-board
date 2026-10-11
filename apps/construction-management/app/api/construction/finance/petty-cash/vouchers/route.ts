import { StatusCodes } from "http-status-codes";
import { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  PETTY_CASH_MENU,
  datesFor,
  pettyCashVouchers,
  voucherBody,
  voucherInputOf,
} from "../handlers";
import {
  CreateConstructionFinancePettyCashVoucherRequestModel,
  ListConstructionFinancePettyCashVouchersRequestModel,
  type ListConstructionFinancePettyCashVouchersResponseModel,
} from "../petty-cash-models";

export const dynamic = "force-dynamic";

const ProjectScope = z.object({ projectId: z.uuid().nullable().optional() });

/** The Project a request names, read first so access is checked before the rest. */
function scopeOf(raw: unknown): { projectId?: string } {
  const parsed = ProjectScope.safeParse(raw);
  const projectId = parsed.success ? parsed.data.projectId : null;
  return projectId == null ? {} : { projectId };
}

/**
 * Petty-cash vouchers newest first, by account, Project, date range,
 * type, status and Payment Category (CM-703), with the totals by type.
 * Only accounts the caller sees (their own without View all), and only
 * vouchers on Projects they are on.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const session = await requireAccess(
      request,
      PETTY_CASH_MENU,
      "read",
      scopeOf(query),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinancePettyCashVouchersRequestModel.safeParse(query),
    );
    const page = await pettyCashVouchers.list(session.access, {
      accountId: model.accountId ?? null,
      projectId: model.projectId ?? null,
      from: model.from ?? null,
      to: model.to ?? null,
      voucherType: model.type ?? null,
      status: model.status ?? null,
      paymentCategoryId: model.paymentCategoryId ?? null,
      limit: model.limit,
      ...(model.after == null ? {} : { after: decodeListCursor(model.after) }),
      ...(model.before == null
        ? {}
        : { before: decodeListCursor(model.before) }),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionFinancePettyCashVouchersResponseModel = {
      items: page.items.map((item) => voucherBody(session, item)),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      totals: {
        payment: Number(page.totals.payment),
        receipt: Number(page.totals.receipt),
        transfer: Number(page.totals.transfer),
      },
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Writes a Payment, Receipt or Transfer voucher on a petty-cash account
 * (Petty Cash Create, on its Project when given), numbered PC on its date.
 * `approve` (Save & Approve) needs Approve and posts at once.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const session = await requireAccess(
      request,
      PETTY_CASH_MENU,
      "create",
      scopeOf(raw),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionFinancePettyCashVoucherRequestModel.safeParse(raw),
    );
    const id = await pettyCashVouchers.create(
      session.access,
      await datesFor(session),
      {
        ...voucherInputOf(model),
        accountId: model.accountId,
        approve: model.approve,
      },
    );
    return Response.json(
      voucherBody(session, await pettyCashVouchers.get(session.access, id)),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
